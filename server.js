const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const cors = require('cors');
const axios = require('axios');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize Firebase Admin SDK
const serviceAccount = {
  type: 'service_account',
  project_id: process.env.PROJECT_ID,
  private_key_id: process.env.PRIVATE_KEY_ID,
  private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.CLIENT_EMAIL,
  client_id: process.env.CLIENT_ID,
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: process.env.CLIENT_X509_CERT_URL
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.DATABASE_URL
});
const db = admin.firestore();

const SCOPES = ['https://www.googleapis.com/auth/firebase.messaging'];

async function getAccessToken() {
  const jwtClient = new google.auth.JWT(
    process.env.CLIENT_EMAIL,
    null,
    process.env.PRIVATE_KEY,
    SCOPES,
    null
  );
  return new Promise((resolve, reject) => {
    jwtClient.authorize((err, tokens) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(tokens.access_token);
    });
  });
}

const sendNotification = async (message, FCM_token, FCM_SERVER_KEY) => {
  const payload = {
    message: {
      token: FCM_token,
      notification: {
        title: 'New Message',
        body: message,
      },
    },
  };

  try {
    const response = await axios.post(
      process.env.FIREBASE_API_URL,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${FCM_SERVER_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('Notification sent successfully:', response.data);
    return true; // Indicate success
  } catch (error) {
    console.error('Error sending notification:', error.message);
    return false; // Indicate failure
  }
};

const pushNotification = async (message, FCM_token) => {
  let FCM_SERVER_KEY;
  let success = false;

  try {
    FCM_SERVER_KEY = await getAccessToken();
    success = await sendNotification(message, FCM_token, FCM_SERVER_KEY);

    if (!success) {
      console.log('Retrying with a new FCM server token...');
      FCM_SERVER_KEY = await getAccessToken();
      success = await sendNotification(message, FCM_token, FCM_SERVER_KEY);
    }
  } catch (error) {
    console.error('Error retrieving access token:', error.message);
  }

  if (!success) {
    console.error('Failed to send notification after retrying.');
  }
};

// Route handler
app.post('/message_notification', async (req, res) => {
  const { message, username, user_id } = req.body;

  if (!message || !username || !user_id) {
    console.error('Missing required fields');
    return res.status(400).send('Missing required fields');
  }

  try {
    console.log(`Received notification request for username: ${username}, user_id: ${user_id}, message: ${message}`);

    const userDoc = await db.collection('users').doc(user_id.toString()).get();

    if (!userDoc.exists) {
      console.error('No such user found!');
      return res.status(404).send('User not found');
    }

    const userData = userDoc.data();
    console.log('User data:', userData);

    await pushNotification(message, userData.fcmToken);

    res.status(200).send('Notification processed successfully');
  } catch (error) {
    console.error('Error retrieving user data:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// Start server
app.listen(8000, () => {
  console.log('Server running on port 8000');
});
