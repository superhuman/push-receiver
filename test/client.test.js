jest.mock('../src/utils/decrypt');

const Client = require('../src/client');
const decrypt = require('../src/utils/decrypt');

const KEYS = {
  authSecret : 'auth-secret',
  privateKey : 'private-key',
};

function createClient(persistentIds = []) {
  return new Client({ keys : KEYS }, { persistentIds });
}

describe('Client', () => {
  describe('_onDataMessage', () => {
    beforeEach(() => {
      decrypt.mockReset();
    });

    [
      'Unsupported state or unable to authenticate data',
      'crypto-key is missing',
      'salt is missing',
    ].forEach(errorMessage => {
      it(`raises "${errorMessage}" after recording the persistent id`, () => {
        const client = createClient();
        const object = { persistentId : 'persistent-id' };
        const decryptionError = new Error(errorMessage);
        let thrownError;

        decrypt.mockImplementation(() => {
          throw decryptionError;
        });

        try {
          client._onDataMessage(object);
        } catch (error) {
          thrownError = error;
        }

        expect(thrownError).toBe(decryptionError);
        expect(client._persistentIds).toEqual(['persistent-id']);
        expect(decrypt).toHaveBeenCalledWith(object, KEYS);
      });
    });

    it('does not record unrelated decrypt errors', () => {
      const client = createClient();
      const object = { persistentId : 'persistent-id' };
      const decryptionError = new Error('unexpected decrypt failure');
      let thrownError;

      decrypt.mockImplementation(() => {
        throw decryptionError;
      });

      try {
        client._onDataMessage(object);
      } catch (error) {
        thrownError = error;
      }

      expect(thrownError).toBe(decryptionError);
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
});
