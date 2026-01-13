
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'controllers', 'analytics.js');
let content = fs.readFileSync(filePath, 'utf8');

// The broken pattern (missing closing braces)
const pattern = /console\.error\('Error fetching popular routes:', error\);\s*res\.status\(StatusCodes\.INTERNAL_SERVER_ERROR\)\.json\(\{\s*\n\/\/ Get accuracy metrics/g;

// The fix
const replacement = `console.error('Error fetching popular routes:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to fetch popular routes',
      error: error.message
    });
  }
};

// Get accuracy metrics`;

if (pattern.test(content)) {
    console.log('Found broken pattern. Fixing...');
    content = content.replace(pattern, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed analytics.js');
} else {
    console.log('Pattern not found. Dumping snippet around target area:');
    const idx = content.indexOf("Error fetching popular routes");
    if (idx !== -1) {
        console.log(content.substring(idx, idx + 200));
    } else {
        console.log('Could not find target string at all.');
    }
}
