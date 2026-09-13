const bcrypt = require('bcrypt');
const supabase = require('../db/supabaseClient');
const systemLogger = require('./systemLogger');
const { AuthError } = require('../middleware/errorHandler');

const BCRYPT_SALT_ROUNDS = 12;

const authService = {
  /**
   * Hash a password with bcrypt cost factor 12
   * @param {string} plainPassword
   * @returns {Promise<string>}
   */
  async hashPassword(plainPassword) {
    return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
  },

  /**
   * Authenticate a user by username and password
   * @param {string} username
   * @param {string} password
   * @param {object} reqContext - IP, user-agent for logging
   * @returns {Promise<{ id: number, username: string, role: string }>}
   */
  async authenticate(username, password, reqContext = {}) {
    if (!username || !password) {
      await systemLogger.logEvent(
        'ERR_AUTH_FAILED',
        'Authentication attempt with missing credentials',
        'WARNING',
        reqContext
      );
      throw new AuthError('Username and password are required', 'ERR_AUTH_FAILED');
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.trim())
      .maybeSingle();

    if (error || !user) {
      await systemLogger.logEvent(
        'ERR_AUTH_FAILED',
        `Authentication failed: user '${username}' not found`,
        'WARNING',
        { username, ...reqContext }
      );
      throw new AuthError('Invalid username or password', 'ERR_AUTH_FAILED');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await systemLogger.logEvent(
        'ERR_AUTH_FAILED',
        `Authentication failed: password mismatch for user '${username}'`,
        'WARNING',
        { username, ...reqContext }
      );
      throw new AuthError('Invalid username or password', 'ERR_AUTH_FAILED');
    }

    await systemLogger.logEvent(
      'INFO_AUTH_SUCCESS',
      `User '${username}' (${user.role}) authenticated successfully`,
      'INFO',
      { username, role: user.role, ...reqContext }
    );

    return {
      id: user.id,
      username: user.username,
      role: user.role
    };
  }
};

module.exports = authService;
