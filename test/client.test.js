jest.mock('../src/utils/decrypt');

const Client = require('../src/client');
const { kLoginResponseTag } = require('../src/constants');
const decrypt = require('../src/utils/decrypt');

const KEYS = {
  authSecret : 'auth-secret',
  privateKey : 'private-key',
};

function createClient(persistentIds = []) {
  return new Client({ keys : KEYS }, { persistentIds });
}

describe('Client', () => {
  beforeEach(() => {
    decrypt.mockReset();
  });

  describe('_onDataMessage', () => {
    [
      'Unsupported state or unable to authenticate data',
      'crypto-key is missing',
      'salt is missing',
    ].forEach(errorMessage => {
      it(`emits "${errorMessage}" after recording the persistent id`, done => {
        const client = createClient();
        const object = { persistentId : 'persistent-id' };
        const decryptionError = new Error(errorMessage);

        decrypt.mockImplementation(() => {
          throw decryptionError;
        });

        client.on('error', error => {
          expect(error).toBe(decryptionError);
          expect(client._persistentIds).toEqual(['persistent-id']);
          expect(decrypt).toHaveBeenCalledWith(object, KEYS);
          done();
        });

        client._onDataMessage(object);
        expect(client._persistentIds).toEqual(['persistent-id']);
      });
    });

    it('emits unrelated decrypt errors without recording the persistent id', done => {
      const client = createClient();
      const object = { persistentId : 'persistent-id' };
      const decryptionError = new Error('unexpected decrypt failure');

      decrypt.mockImplementation(() => {
        throw decryptionError;
      });

      client.on('error', error => {
        expect(error).toBe(decryptionError);
        expect(client._persistentIds).toEqual([]);
        done();
      });

      client._onDataMessage(object);
      expect(client._persistentIds).toEqual([]);
    });

    it('records and emits successfully decrypted messages', () => {
      const client = createClient();
      const object = { persistentId : 'persistent-id' };
      const message = { title : 'Hello' };
      const onNotification = jest.fn();

      decrypt.mockReturnValue(message);
      client.on('ON_NOTIFICATION_RECEIVED', onNotification);

      client._onDataMessage(object);

      expect(client._persistentIds).toEqual(['persistent-id']);
      expect(onNotification).toHaveBeenCalledWith({
        notification : message,
        persistentId : 'persistent-id',
      });
    });
  });

  describe('persistentIds event', () => {
    it('clears and emits on a successful login response', () => {
      const client = createClient(['a', 'b']);
      const onPersistentIds = jest.fn();
      const onLoginResponse = jest.fn();
      client.on('persistentIds', onPersistentIds);
      client.on('loginResponse', onLoginResponse);

      client._onMessage({ tag : kLoginResponseTag, object : {} });

      expect(client._persistentIds).toEqual([]);
      expect(onPersistentIds).toHaveBeenCalledWith([]);
      expect(onLoginResponse).toHaveBeenCalledWith({});
    });

    it('does not clear on an errored login response', () => {
      const client = createClient(['a', 'b']);
      const onPersistentIds = jest.fn();
      const onLoginResponse = jest.fn();
      client.on('persistentIds', onPersistentIds);
      client.on('loginResponse', onLoginResponse);
      const object = { error : { code : 1 } };

      client._onMessage({ tag : kLoginResponseTag, object });

      expect(client._persistentIds).toEqual(['a', 'b']);
      expect(onPersistentIds).not.toHaveBeenCalled();
      expect(onLoginResponse).toHaveBeenCalledWith(object);
    });

    it('emits before the notification on a decrypted message', () => {
      const client = createClient();
      const order = [];
      decrypt.mockReturnValue({ title : 'Hello' });
      client.on('persistentIds', ids => order.push(['persistentIds', ids]));
      client.on('ON_NOTIFICATION_RECEIVED', () => order.push(['notification']));

      client._onDataMessage({ persistentId : 'persistent-id' });

      expect(order).toEqual([
        ['persistentIds', ['persistent-id']],
        ['notification'],
      ]);
    });

    it('emits after recording a reportable decryption error', () => {
      const client = createClient();
      const onPersistentIds = jest.fn();
      client.on('persistentIds', onPersistentIds);
      client.on('error', () => {});
      decrypt.mockImplementation(() => {
        throw new Error('salt is missing');
      });

      client._onDataMessage({ persistentId : 'persistent-id' });

      expect(onPersistentIds).toHaveBeenCalledWith(['persistent-id']);
    });

    it('does not emit for an unreportable decryption error', () => {
      const client = createClient();
      const onPersistentIds = jest.fn();
      client.on('persistentIds', onPersistentIds);
      client.on('error', () => {});
      decrypt.mockImplementation(() => {
        throw new Error('unexpected decrypt failure');
      });

      client._onDataMessage({ persistentId : 'persistent-id' });

      expect(onPersistentIds).not.toHaveBeenCalled();
    });

    it('does not emit for an already-recorded persistent id', () => {
      const client = createClient(['persistent-id']);
      const onPersistentIds = jest.fn();
      client.on('persistentIds', onPersistentIds);

      client._onDataMessage({ persistentId : 'persistent-id' });

      expect(onPersistentIds).not.toHaveBeenCalled();
    });

    it('emits a snapshot copy of the full id list', () => {
      const client = createClient();
      const snapshots = [];
      decrypt.mockReturnValue({ title : 'Hello' });
      client.on('persistentIds', ids => snapshots.push(ids));

      client._onDataMessage({ persistentId : 'a' });
      snapshots[0].push('mutated');
      client._onDataMessage({ persistentId : 'b' });

      expect(snapshots[1]).toEqual(['a', 'b']);
    });
  });
});
