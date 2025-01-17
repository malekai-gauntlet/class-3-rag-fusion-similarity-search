import cron from 'node-cron';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Schedule task to run every Sunday at midnight
cron.schedule('0 0 * * 0', () => {
    console.log('Starting weekly vector DB update:', new Date().toISOString());
    
    // Get the full path to scheduled-upload.js
    const scriptPath = path.join(__dirname, 'scheduled-upload.js');
    
    // Execute the upload script
    exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
            console.error('Error running upload script:', error);
            return;
        }
        
        // Log output from the script
        if (stdout) console.log('Upload script output:', stdout);
        if (stderr) console.error('Upload script errors:', stderr);
        
        console.log('Weekly update completed:', new Date().toISOString());
    });
}, {
    scheduled: true,
    timezone: "America/Los_Angeles" // Adjust timezone as needed
});

console.log('Vector DB update scheduler is running. Will execute every Sunday at midnight PT.');

// Keep the process running
process.stdin.resume(); 