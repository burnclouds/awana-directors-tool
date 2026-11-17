(this.AwanaVersions = this.AwanaVersions || {})['drive-config.js'] = '1.1.0';
// Google Drive settings for the published copy (static.burnclouds.net). make-deploy.sh copies this over deploy/app/drive-config.js; dev/app/drive-config.js stays empty so development
// and the tests never talk to Google. These three values are public by design (they identify the app, not a person): the Client ID, a browser API key limited to the Picker and Drive APIs, and the project number.
this.AwanaDriveConfig = { clientId: '678557810643-92kkcd5uh5u1asbs50mr319sj8nrfcin.apps.googleusercontent.com', apiKey: 'AIzaSyADnFIbSEr3sQts2QC5akOafSx2u1tAcvk', appId: '678557810643' };
