const { SENDER_ID, SERVER_KEY } = require('./keys');
const { register, listen } = require('../src/index');

const NOTIFICATIONS = {
  SIMPLE : { title : 'Hello world ', body : 'Test' },
  LARGE  : { title : 'Hello world ', body : require('./4kb') },
};

let credentials;
let client;
describe('Parser', function() {
  beforeEach(async function() {
    credentials = await register(SENDER_ID);
  });

  afterEach(async function() {
    client.destroy();
    credentials = null;
  });

  it('should receive a simple notification', async function() {
    await send(NOTIFICATIONS.SIMPLE);
    const notifications = await receive(1);
    expect(notifications.length).toEqual(1);
    expect(notifications[0].notification.notification).toEqual(
      NOTIFICATIONS.SIMPLE
    );
  });

  it('should receive a large notification', async function() {
    await send(NOTIFICATIONS.LARGE);
    const notifications = await receive(1);
    expect(notifications.length).toEqual(1);
    expect(notifications[0].notification.notification).toEqual(
      NOTIFICATIONS.LARGE
    );
  });

  it('should receive multiple notifications', async function() {
    await send(NOTIFICATIONS.SIMPLE);
    await send(NOTIFICATIONS.LARGE);
    await send(NOTIFICATIONS.SIMPLE);

    const notifications = await receive(3);
    expect(notifications.length).toEqual(3);
    expect(notifications[0].notification.notification).toEqual(
      NOTIFICATIONS.SIMPLE
    );
    expect(notifications[1].notification.notification).toEqual(
      NOTIFICATIONS.LARGE
    );
    expect(notifications[2].notification.notification).toEqual(
      NOTIFICATIONS.SIMPLE
    );
  });
});

async function send(notification) {
  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method  : 'POST',
      headers : {
        'Content-Type'  : 'application/json',
        'Authorization' : `key=${SERVER_KEY}`,
      },
      body : JSON.stringify({
        to           : credentials.fcm.token,
        notification : notification,
      }),
    });

    const data = await response.json();

    if (data.success !== 1) {
      throw new Error(`sending of notification failed: ${JSON.stringify(data)}`);
    }

    return data;
  } catch (error) {
    // This will catch both fetch errors and our custom error
    throw new Error(
      `sending of notification failed: ${error.message}`
    );
  }
}

async function receive(n) {
  const received = [];
  return new Promise(async resolve => {
    const onNotification = notification => {
      received.push(notification);
      if (received.length === n) {
        resolve(received);
      }
    };
    credentials.persistentIds = [];
    client = await listen(credentials, onNotification);
  });
}
