(this.AwanaVersions = this.AwanaVersions || {})['drive-config.js'] = '1.0.0';
// Google Drive is optional and OFF while clientId and apiKey are empty: no button is shown and no Google code is ever loaded,
// so a copy of the app on a closed network works exactly as it always did with local files. To turn it on, fill these in (see GOOGLE-DRIVE.md).
//   clientId  the OAuth 2.0 Client ID (Web application) of your Google Cloud project, ends in .apps.googleusercontent.com
//   apiKey    a browser API key restricted to this site and to the Picker API
//   appId     the project number (the digits before the first dash of the client ID); lets the file picker grant this app access to the files you pick
this.AwanaDriveConfig = { clientId: '', apiKey: '', appId: '' };
