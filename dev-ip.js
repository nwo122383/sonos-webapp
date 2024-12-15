const prompt = require('prompt');
const { exec } = require('child_process');
const fs = require('fs');

prompt.start();
prompt.get(['ip'], (err, result) => {
  if (err) {
    console.error('Error getting IP address:', err);
    return;
  }

  const ipAddress = result.ip;

  fs.writeFileSync('.env.local', `VITE_SONOS_IP=${ipAddress}`);

  const vite = exec('npm run dev', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error running Vite server: ${error}`);
    }
  });

  vite.stdout.pipe(process.stdout);
  vite.stderr.pipe(process.stderr);
});