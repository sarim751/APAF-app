const Ajv = require('ajv');
const idfsSchema = require('../schemas/idfs-schema.json');

const ajv = new Ajv({ allErrors: true });

// Compile per-instrument validators
const validators = {
  ELS: ajv.compile(idfsSchema.definitions.ELS),
  IMA: ajv.compile(idfsSchema.definitions.IMA),
  NPD: ajv.compile(idfsSchema.definitions.NPD)
};

const schemaValidator = {
  /**
   * Validates dataset payload against instrument IDFS schema
   * @param {'ELS' | 'IMA' | 'NPD'} instrument
   * @param {object} data
   * @returns {{ valid: boolean, errors: array | null }}
   */
  validateIdfs(instrument, data) {
    const validator = validators[instrument];
    if (!validator) {
      return {
        valid: false,
        errors: [{ message: `Unsupported instrument schema for '${instrument}'` }]
      };
    }

    const valid = validator(data);
    return {
      valid: Boolean(valid),
      errors: valid ? null : validator.errors
    };
  }
};

module.exports = schemaValidator;
