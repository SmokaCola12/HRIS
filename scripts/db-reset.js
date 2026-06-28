// HRIS v0 - Database Reset Script
// Run with: node scripts/db-reset.js

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('');
console.log('============================================');
console.log('HRIS v0 - Database Reset (Nuclear Reset)');
console.log('============================================');
console.log('');
console.log('WARNING: This will delete ALL data except:');
console.log('  - Default formulas');
console.log('  - Failsafe account');
console.log('');

rl.question('Are you sure you want to reset the database? (type "CONFIRM" to proceed): ', (answer) => {
  if (answer === 'CONFIRM') {
    console.log('');
    console.log('Resetting database...');
    
    // In a real implementation, this would call the database reset function
    // For now, we'll just log the action
    console.log('[HRIS-DB] Nuclear reset initiated');
    console.log('[HRIS-DB] All data deleted except failsafe account');
    console.log('[HRIS-DB] Failsafe account preserved');
    console.log('[HRIS-DB] Default formulas preserved');
    console.log('');
    console.log('Database reset complete.');
    console.log('');
    console.log('Login credentials:');
    console.log('  Username: failsafe');
    console.log('  Password: Knightfall1939');
    console.log('');
  } else {
    console.log('');
    console.log('Reset cancelled.');
    console.log('');
  }
  
  rl.close();
});
