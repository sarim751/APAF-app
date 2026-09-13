const bcrypt = require('bcrypt');
const supabase = require('./supabaseClient');
require('dotenv').config();

const BCRYPT_SALT_ROUNDS = 12;

async function seed() {
  console.log('Seeding initial APAF-Lite users...');

  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const sciencePassword = process.env.SCIENCE_PASSWORD || 'science123';

  const adminHash = await bcrypt.hash(adminPassword, BCRYPT_SALT_ROUNDS);
  const scienceHash = await bcrypt.hash(sciencePassword, BCRYPT_SALT_ROUNDS);

  const usersToSeed = [
    {
      username: 'admin',
      password_hash: adminHash,
      role: 'ADMIN'
    },
    {
      username: 'scientist',
      password_hash: scienceHash,
      role: 'SCIENCE_TEAM'
    }
  ];

  for (const user of usersToSeed) {
    const { data, error } = await supabase
      .from('users')
      .upsert(user, { onConflict: 'username' });

    if (error) {
      console.error(`Error seeding user ${user.username}:`, error.message);
      throw error;
    }
    console.log(`User '${user.username}' (${user.role}) seeded successfully.`);
  }

  console.log('Database seeding complete.');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}

module.exports = seed;
