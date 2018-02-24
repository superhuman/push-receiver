const EventEmitter = require('events');
const Long = require('long');
const Parser = require('./parser');
const decrypt = require('./utils/decrypt');
const path = require('path');
const tls = require('tls');
const {checkIn} = require('./gcm');
const {kMCSVersion, kLoginRequestTag} = require('./constants');
const {load} = require('protobufjs');

const HOST = 'mtalk.google.com';
const PORT = 5228;
const MAX_RETRY_TIMEOUT = 15;

let proto = null;

module.exports = class Client extends EventEmitter {
  static async init () {
    if (proto) {
      return;
    }
    proto = await load(path.resolve(__dirname, 'mcs.proto'));
  }

  constructor(credentials, persistentIds) {
    super();
    this._credentials = credentials;
    this._persistentIds = persistentIds || [];
    this._retryCount = 0;
    this._onSocketConnect = this._onSocketConnect.bind(this);
    this._onSocketClose = this._onSocketClose.bind(this);
    this._onSocketError = this._onSocketError.bind(this);
    this._onDataMessage = this._onDataMessage.bind(this);
    this._onParserError = this._onParserError.bind(this);
  }

  async connect() {
    await Client.init();
    await this._checkIn();
    this._connect();
    // can happen if the socket immediately closes after being created
    if (!this._socket) { return }
    await Parser.init();
    // can happen if the socket immediately closes after being created
    if (!this._socket) { return }
    this._parser = new Parser(this._socket);
    this._parser.on('dataMessage', this._onDataMessage);
    this._parser.on('error', this._onParserError);
  }

  destroy() {
    this._destroy();
  }

  async _checkIn() {
    return checkIn(this._credentials.gcm.androidId, this._credentials.gcm.securityToken);
  }

  _connect() {
    this._socket = new tls.TLSSocket();
    this._socket.setKeepAlive(true);
    this._socket.on('connect', this._onSocketConnect);
    this._socket.on('close', this._onSocketClose);
    this._socket.on('error', this._onSocketError);
    this._socket.connect({host : HOST, port : PORT});
    this._socket.write(this._loginBuffer());
  }

  _destroy() {
    clearTimeout(this._retryTimeout);
    if (this._socket) {
      this._socket.removeListener('connect', this._onSocketConnect);
      this._socket.removeListener('close', this._onSocketClose);
      this._socket.removeListener('error', this._onSocketError);
      this._socket.destroy();
      this._socket = null;
    }
    if (this._parser) {
      this._parser.removeListener('dataMessage', this._onDataMessage);
      this._parser.removeListener('error', this._onParserError);
      this._parser.destroy();
      this._parser = null;
    }
  }

  _loginBuffer() {
    const LoginRequestType = proto.lookupType('mcs_proto.LoginRequest');
    const hexAndroidId = Long.fromString(this._credentials.gcm.androidId).toString(16);
    const loginRequest = {
      adaptiveHeartbeat    : false,
      authService          : 2,
      authToken            : this._credentials.gcm.securityToken,
      id                   : 'chrome-63.0.3234.0',
      domain               : 'mcs.android.com',
      deviceId             : `android-${hexAndroidId}`,
      networkType          : 1,
      resource             : this._credentials.gcm.androidId,
      user                 : this._credentials.gcm.androidId,
      useRmq2              : true,
      setting              : [{name : 'new_vc', value : '1'}],
      // Id of the last notification received
      clientEvent          : [],
      // FIXME Figure out how to pass persistentIds without being kickout by Google
      receivedPersistentId : [],
    };

    const errorMessage = LoginRequestType.verify(loginRequest);
    if (errorMessage) {
      throw new Error(errorMessage);
    }
    const message = LoginRequestType.create(loginRequest);
    const buffer = LoginRequestType.encodeDelimited(message).finish();

    // FIXME Can change depending on persistentIds
    return Buffer.concat([Buffer.from([kMCSVersion, kLoginRequestTag]), buffer]);
  }

  _onSocketConnect() {
    this._retryCount = 0;
    this.emit('connect');
  }

  _onSocketClose() {
    this._retry();
  }

  _onSocketError(error) {
    // ignore, the close handler takes care of retry
    console.error(error);
  }

  _onParserError(error) {
    this.emit('parserError', error)
    this._retry();
    console.error(error);
  }

  _retry() {
    this._destroy();
    const timeout = Math.min(++this._retryCount, MAX_RETRY_TIMEOUT) * 1000;
    this._retryTimeout = setTimeout(this.connect.bind(this), timeout);
  }

  _onDataMessage(object) {
    if (this._persistentIds.includes(object.persistentId)) {
      return;
    }

    let message
    try {
      message = decrypt(object, this._credentials.keys);
    } catch (error) {
      // NOTE(ibash) we seem to be getting errors while decrypting. I want to
      // know if these errors are recoverable, whether it's just a single
      // notification that will fail or if it's all notifications going forward.
      // So we keep track of whether we've just seen a failed notification and
      // whether we get a notification that goes through after that.

      // Put the object in _persistentIds so we ignore a failed notification next time
      this._persistentIds.push(object.persistentId);

      // For detecting whether we can recover after failing to decrypt
      this._failedToDecrypt = {object: object, keys: this._credentials.keys}

      error.metaData = {message: JSON.stringify(object), keys: JSON.stringify(this._credentials.keys)}
      // throw in a setTimeout s.t. bugsnag can catch the error, but we don't
      // want to break the connection
      setTimeout(() => {
        throw error
      }, 0)
      return
    }

    // detect if we've recovered from a failed notification
    if (this._failedToDecrypt && this._credentials.keys.privateKey == this._failedToDecrypt.keys.privateKey) {
      let failedToDecrypt = this._failedToDecrypt
      this._failedToDecrypt = null
      let keys = this._credentials.keys
      setTimeout(() => {
        // HACK(ibash) this should really log somewhere instead but ... bugsnag
        // is my log :D
        let error = new Error('Recovered from failure to decrypt notification')
        error.metaData = {
          failed: {message: JSON.stringify(failedToDecrypt.object), keys: JSON.stringify(failedToDecrypt.keys)},
          succeeded: {message: JSON.stringify(object), keys: JSON.stringify(keys)},
        }
        throw error
      }, 0)
    }

    // Maintain persistentIds updated with the very last received value
    this._persistentIds.push(object.persistentId);
    // Send notification
    this.emit('ON_NOTIFICATION_RECEIVED', {
      notification : message,
      // Needs to be saved by the client
      persistentId : object.persistentId,
    });
  }
};
