ALTER TYPE business_type RENAME TO business_type_old;

CREATE TYPE business_type AS ENUM (
  'auto_detailing',
  'mobile_detailing',
  'wrap_ppf',
  'window_tinting',
  'performance',
  'mechanic',
  'tire_shop',
  'muffler_shop'
);

ALTER TABLE businesses
ALTER COLUMN type TYPE business_type
USING (
  CASE type::text
    WHEN 'auto_detailing' THEN 'auto_detailing'
    WHEN 'mobile_detailing' THEN 'mobile_detailing'
    WHEN 'ppf_ceramic' THEN 'wrap_ppf'
    WHEN 'tint_shop' THEN 'window_tinting'
    WHEN 'mechanic' THEN 'mechanic'
    WHEN 'tire_shop' THEN 'tire_shop'
    WHEN 'car_wash' THEN 'auto_detailing'
    WHEN 'wrap_shop' THEN 'wrap_ppf'
    WHEN 'dealership_service' THEN 'mechanic'
    WHEN 'body_shop' THEN 'wrap_ppf'
    WHEN 'other_auto_service' THEN 'mechanic'
    ELSE 'mechanic'
  END::business_type
);

DROP TYPE business_type_old;
