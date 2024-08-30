const { register, listen } = require('../src');
const apiKey = require('yargs').argv.apiKey;
const appID = require('yargs').argv.appID;
const projectID = require('yargs').argv.projectID;

if (!apiKey) {
  console.error('Missing apiKey');
  return;
}
else if (!appID) {
  console.error('Missing appID');
  return;
}
else if (!projectID) {
  console.error('Missing projectID');
  return;
}

const config = {
  firebase: {
    apiKey,
    appID,
    projectID
  },
  vapidKey: ''
};

(async () => {
  // First time
  // Register to GCM and FCM
  const credentials = await register(config); // You should call register only once and then store the credentials somewhere
  const fcmToken = credentials.fcm.token; // Token to use to send notifications
  console.log('Use this following token to send a notification', fcmToken);
  // persistentIds is the list of notification ids received to avoid receiving all already received notifications on start.
  const persistentIds = []; // get all previous persistentIds from somewhere (file, db, etc...)
  await listen({ ...credentials, persistentIds }, onNotification);
})();

// Called on new notification
function onNotification({ notification }) {
  // Do someting with the notification
  console.log('Notification received');
  console.log(notification);
}
