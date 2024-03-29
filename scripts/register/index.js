const { register } = require('../../src');
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
  try {
    await register(config);
    console.log('Successfully registered');
  } catch (e) {
    console.error('Error during registration');
    console.error(e);
  }
})();
