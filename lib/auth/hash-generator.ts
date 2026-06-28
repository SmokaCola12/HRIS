import bcrypt from 'bcryptjs';

/**
 * Generate bcrypt hash for a password
 * Run this to get the hash for Knightfall1939
 * 
 * Usage in Node.js:
 * const bcrypt = require('bcryptjs');
 * const password = 'Knightfall1939';
 * const hash = bcrypt.hashSync(password, 10);
 * console.log(hash);
 */

export async function generatePasswordHash(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// For reference, the hash for "Knightfall1939" is:
// $2a$10$E.pTENLscFZRmDVWAc4Z.uL8Vn.V3Z8K0V0K0V0K0V0K0V0K0V0K0
// 
// But this needs to be generated with actual bcrypt.
// Use this command in Node.js to get the real hash:
// node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('Knightfall1939', 10));"
