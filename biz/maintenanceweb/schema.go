package maintenanceweb

// Provisioned explicitly by an init Job, never by HTTP handlers or business startup.
const Schema = `
CREATE TABLE IF NOT EXISTS rb_web_task (
 task_id uuid PRIMARY KEY,instance_id uuid NOT NULL REFERENCES rb_maintenance_instance(instance_id),request_id uuid NOT NULL,
 kind text NOT NULL,parameter_hash text NOT NULL,actor text NOT NULL,actor_id bigint NOT NULL,reason text NOT NULL DEFAULT '',
 state text NOT NULL DEFAULT 'queued',phase text NOT NULL DEFAULT 'queued',revision bigint NOT NULL DEFAULT 1,
 operation_id uuid,engine_request uuid NOT NULL,engine_confirm text NOT NULL DEFAULT '',backup_id uuid,preview_id uuid,parent_task_id uuid,
 job_name text NOT NULL,job_uid text,template_hash text NOT NULL,request jsonb NOT NULL,
 result jsonb,error jsonb,progress jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,finished_at timestamptz,
 UNIQUE(instance_id,request_id),UNIQUE(instance_id,job_name));
CREATE TABLE IF NOT EXISTS rb_web_outbox(task_id uuid PRIMARY KEY REFERENCES rb_web_task(task_id),dispatched boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rb_web_preview(preview_id uuid PRIMARY KEY,instance_id uuid NOT NULL,task_id uuid NOT NULL UNIQUE,plan jsonb NOT NULL,view jsonb NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS rb_web_backup(backup_id uuid PRIMARY KEY,instance_id uuid NOT NULL,view jsonb NOT NULL,verification_state text NOT NULL DEFAULT 'unknown',checked_at timestamptz);
CREATE TABLE IF NOT EXISTS rb_web_event(event_id bigserial PRIMARY KEY,task_id uuid NOT NULL,revision bigint NOT NULL,phase text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rb_web_result(token_hash text PRIMARY KEY,instance_id uuid NOT NULL,operation_id uuid NOT NULL,user_id bigint NOT NULL,credential_version bigint NOT NULL,session_hash text NOT NULL,expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS rb_web_task_listing ON rb_web_task(instance_id,created_at DESC,task_id DESC);
`
