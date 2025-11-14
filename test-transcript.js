const http = require('http');

const data = JSON.stringify({
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  format: 'json'
});

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/transcribe',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Testing YouTube transcript extraction...');
console.log('Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ');
console.log('');

const req = http.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    try {
      const result = JSON.parse(responseData);

      if (result.success) {
        console.log('✓ Transcript extracted successfully!');
        console.log('');
        console.log('Video URL:', result.data.videoUrl);
        console.log('Format:', result.data.format);
        console.log('Total segments:', result.data.transcript.length);
        console.log('Extracted at:', result.data.extractedAt);
        console.log('');
        console.log('First 5 segments:');
        result.data.transcript.slice(0, 5).forEach((segment, i) => {
          console.log(`  [${segment.time}] ${segment.text}`);
        });
        console.log('');
        console.log('✓ Custom Playwright-based extraction working correctly!');
      } else {
        console.log('✗ Extraction failed:', result.error);
      }
    } catch (error) {
      console.log('✗ Error parsing response:', error.message);
      console.log('Raw response:', responseData);
    }
  });
});

req.on('error', (error) => {
  console.log('✗ Request error:', error.message);
});

req.write(data);
req.end();

// Timeout after 2 minutes
setTimeout(() => {
  console.log('Request timed out after 2 minutes');
  process.exit(1);
}, 120000);
