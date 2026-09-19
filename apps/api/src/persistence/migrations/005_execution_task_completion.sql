ALTER TABLE execution_tasks ADD COLUMN completion_outcome TEXT;
ALTER TABLE execution_tasks ADD COLUMN completed_quantity REAL;
ALTER TABLE execution_tasks ADD COLUMN completed_quantity_unit TEXT;
ALTER TABLE execution_tasks ADD COLUMN completion_note TEXT;
