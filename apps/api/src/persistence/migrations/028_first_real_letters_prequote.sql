ALTER TABLE commercial_request_installation_facts
  ADD COLUMN crew_size INTEGER;

ALTER TABLE commercial_request_installation_facts
  ADD COLUMN planned_duration_hours REAL;

ALTER TABLE commercial_requests
  ADD COLUMN installation_manual_net_eur REAL;

ALTER TABLE resource_cost_evidence
  ADD COLUMN supplier_label TEXT;

ALTER TABLE resource_cost_evidence
  ADD COLUMN valid_from TEXT;

ALTER TABLE resource_cost_evidence
  ADD COLUMN valid_until TEXT;
