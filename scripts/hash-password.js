const bcrypt = require('bcryptjs');

async function generateHash() {
  const password = 'Knightfall1939';
  const hash = await bcrypt.hash(password, 10);
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('\nUse this hash in your database configuration');
}

generateHash().catch(console.error);
