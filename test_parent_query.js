const https = require('https');

const SUPABASE_URL = 'https://ojodojygymwvxchzxjsj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qb2RvanlneW13dnhjaHp4anNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk3MTcxNzksImV4cCI6MTkyNTI5MzE3OX0.mF-I4H5FKW-1YIxZ6Qu3B3RFcAXaHN4eJQRBqOgVx3M';

const url = new URL(SUPABASE_URL + '/rest/v1/parents?select=id,email,first_name,last_name');

const options = {
  hostname: url.hostname,
  path: url.pathname + url.search,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      if (Array.isArray(result)) {
        if (result.length === 0) {
          console.log('No parents found in database');
        } else {
          console.log('Found parents:');
          result.forEach(p => {
            console.log(`  ID: ${p.id}`);
            console.log(`  Email: ${p.email}`);
            console.log(`  Name: ${p.first_name} ${p.last_name}`);
            console.log('---');
          });
        }
      } else if (result.message) {
        console.log('Error:', result.message);
      } else {
        console.log('Unexpected response:', result);
      }
    } catch(e) {
      console.log('Error parsing response:', e.message);
    }
  });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.end();
