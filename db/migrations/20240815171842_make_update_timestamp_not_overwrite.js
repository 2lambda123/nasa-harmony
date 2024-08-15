const ORIGINAL_ON_UPDATE_TIMESTAMP_FUNCTION = `
  CREATE OR REPLACE FUNCTION on_update_timestamp()
  RETURNS trigger AS $$
  BEGIN
    NEW."updatedAt" = now();
    RETURN NEW;
  END;
$$ language 'plpgsql';
`

const NON_OVERWRITING_ON_UPDATE_TIMESTAMP_FUNCTION = `
  CREATE OR REPLACE FUNCTION on_update_timestamp()
  RETURNS trigger AS $$
  BEGIN
    IF NEW."updatedAt" IS NULL THEN
      NEW."updatedAt" = now();
    END IF;
    RETURN NEW;
  END;
$$ language 'plpgsql';
`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.raw(NON_OVERWRITING_ON_UPDATE_TIMESTAMP_FUNCTION);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.raw(ORIGINAL_ON_UPDATE_TIMESTAMP_FUNCTION);
};
