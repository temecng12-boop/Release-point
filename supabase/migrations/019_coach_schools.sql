-- Add schools array column to profiles for coaches who attended multiple schools
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS schools text[];
