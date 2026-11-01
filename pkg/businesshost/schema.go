package businesshost

// Schema is applied explicitly by the deployment initializer, not by the host.
// Only the HOST identity may INSERT runs and UPDATE its own run evidence.
// RLS policies bind rows to the Pod/boot settings of each transaction.
const Schema = `
CREATE TABLE IF NOT EXISTS rb_business_run (
 instance_id uuid NOT NULL REFERENCES rb_maintenance_instance(instance_id),
 pod_uid text NOT NULL,boot_id uuid NOT NULL,run_id uuid PRIMARY KEY,
 config_sha text NOT NULL,identity jsonb NOT NULL,
 state text NOT NULL CHECK(state IN('launching','running','exited','stopped','unknown')),
 exit_code integer,operation_id uuid,token bigint,
 started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 UNIQUE(instance_id,pod_uid,boot_id,run_id));
CREATE INDEX IF NOT EXISTS rb_business_run_instance ON rb_business_run(instance_id,pod_uid);
ALTER TABLE rb_business_run ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rb_host_run ON rb_business_run;
CREATE POLICY rb_host_run ON rb_business_run
 USING (pod_uid=current_setting('rainbow.host_pod',true) AND boot_id::text=current_setting('rainbow.host_boot',true))
 WITH CHECK (pod_uid=current_setting('rainbow.host_pod',true) AND boot_id::text=current_setting('rainbow.host_boot',true));
CREATE OR REPLACE FUNCTION rb_host_unresolved(i uuid,p text,b text) RETURNS bigint
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS
 'SELECT count(*) FROM public.rb_business_run WHERE instance_id=i AND pod_uid=p AND state<>''stopped''';
REVOKE ALL ON FUNCTION rb_host_unresolved(uuid,text,text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION rb_host_unresolved_all(i uuid) RETURNS bigint
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=off AS
 'SELECT count(*) FROM public.rb_business_run WHERE instance_id=i AND state<>''stopped''';
REVOKE ALL ON FUNCTION rb_host_unresolved_all(uuid) FROM PUBLIC;
`
