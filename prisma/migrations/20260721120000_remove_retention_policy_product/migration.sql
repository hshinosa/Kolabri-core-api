-- Remove unsupported retention-policy product persistence.
DROP TABLE IF EXISTS "data_retention_policies";
DROP TYPE IF EXISTS "DataType";
