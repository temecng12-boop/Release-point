-- Add phase_checklist JSONB to clips for mechanical phase annotations
ALTER TABLE clips ADD COLUMN IF NOT EXISTS phase_checklist jsonb;
