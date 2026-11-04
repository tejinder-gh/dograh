--
-- PostgreSQL database dump
--

-- Dumped from database version 17.11 (11592b3)
-- Dumped by pg_dump version 18.4 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: campaign_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_state AS ENUM (
    'created',
    'syncing',
    'running',
    'paused',
    'completed',
    'failed'
);


--
-- Name: document_processing_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_processing_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);


--
-- Name: queued_run_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.queued_run_state AS ENUM (
    'queued',
    'processed',
    'processing',
    'failed'
);


--
-- Name: quota_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.quota_type AS ENUM (
    'monthly',
    'annual'
);


--
-- Name: recording_storage_backend; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recording_storage_backend AS ENUM (
    's3',
    'minio'
);


--
-- Name: storage_backend; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.storage_backend AS ENUM (
    's3',
    'minio'
);


--
-- Name: tool_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tool_category AS ENUM (
    'http_api',
    'end_call',
    'transfer_call',
    'transfer_agent',
    'calculator',
    'native',
    'integration',
    'mcp'
);


--
-- Name: tool_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tool_status AS ENUM (
    'active',
    'archived',
    'draft'
);


--
-- Name: trigger_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trigger_state AS ENUM (
    'active',
    'archived'
);


--
-- Name: webhook_credential_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.webhook_credential_type AS ENUM (
    'none',
    'api_key',
    'bearer_token',
    'basic_auth',
    'custom_header'
);


--
-- Name: webhook_delivery_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.webhook_delivery_status AS ENUM (
    'pending',
    'succeeded',
    'dead_letter'
);


--
-- Name: workflow_call_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workflow_call_type AS ENUM (
    'inbound',
    'outbound'
);


--
-- Name: workflow_run_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workflow_run_state AS ENUM (
    'initialized',
    'running',
    'completed'
);


--
-- Name: workflow_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workflow_status AS ENUM (
    'active',
    'archived'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_triggers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_triggers (
    id integer NOT NULL,
    trigger_path character varying(36) NOT NULL,
    workflow_id integer NOT NULL,
    organization_id integer NOT NULL,
    state public.trigger_state DEFAULT 'active'::public.trigger_state NOT NULL,
    created_at timestamp with time zone
);


--
-- Name: agent_triggers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_triggers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_triggers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_triggers_id_seq OWNED BY public.agent_triggers.id;


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    name character varying NOT NULL,
    key_hash character varying NOT NULL,
    key_prefix character varying NOT NULL,
    is_active boolean NOT NULL,
    created_by integer,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone,
    archived_at timestamp with time zone
);


--
-- Name: api_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.api_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: api_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.api_keys_id_seq OWNED BY public.api_keys.id;


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id integer NOT NULL,
    name character varying NOT NULL,
    organization_id integer NOT NULL,
    workflow_id integer NOT NULL,
    created_by integer NOT NULL,
    source_type character varying NOT NULL,
    source_id character varying NOT NULL,
    state public.campaign_state NOT NULL,
    total_rows integer,
    processed_rows integer NOT NULL,
    failed_rows integer NOT NULL,
    created_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone,
    rate_limit_per_second integer NOT NULL,
    max_retries integer NOT NULL,
    source_sync_status character varying NOT NULL,
    source_last_synced_at timestamp with time zone,
    source_sync_error character varying,
    retry_config json DEFAULT '{"enabled": true, "max_retries": 2, "retry_on_busy": true, "retry_on_no_answer": true, "retry_on_voicemail": true, "retry_delay_seconds": 120}'::jsonb NOT NULL,
    last_batch_scheduled_at timestamp with time zone,
    last_activity_at timestamp with time zone,
    orchestrator_metadata json DEFAULT '{}'::json NOT NULL,
    telephony_configuration_id integer,
    logs json DEFAULT '[]'::json NOT NULL
);


--
-- Name: campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaigns_id_seq OWNED BY public.campaigns.id;


--
-- Name: embed_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embed_sessions (
    id integer NOT NULL,
    session_token character varying(255) NOT NULL,
    embed_token_id integer NOT NULL,
    workflow_run_id integer,
    client_ip character varying(45),
    user_agent character varying(500),
    origin character varying(255),
    created_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: embed_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.embed_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: embed_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.embed_sessions_id_seq OWNED BY public.embed_sessions.id;


--
-- Name: embed_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embed_tokens (
    id integer NOT NULL,
    token character varying(255) NOT NULL,
    workflow_id integer NOT NULL,
    organization_id integer NOT NULL,
    allowed_domains json,
    settings json,
    is_active boolean NOT NULL,
    usage_limit integer,
    usage_count integer NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone,
    created_by integer NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: embed_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.embed_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: embed_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.embed_tokens_id_seq OWNED BY public.embed_tokens.id;


--
-- Name: external_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_credentials (
    id integer NOT NULL,
    credential_uuid character varying(36) NOT NULL,
    organization_id integer NOT NULL,
    name character varying NOT NULL,
    description character varying,
    credential_type public.webhook_credential_type NOT NULL,
    credential_data json NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    is_active boolean NOT NULL
);


--
-- Name: external_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.external_credentials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: external_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.external_credentials_id_seq OWNED BY public.external_credentials.id;


--
-- Name: folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folders (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    name character varying NOT NULL,
    created_at timestamp with time zone
);


--
-- Name: folders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.folders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: folders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.folders_id_seq OWNED BY public.folders.id;


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    id integer NOT NULL,
    integration_id character varying NOT NULL,
    organization_id integer NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone,
    created_by integer,
    provider character varying NOT NULL,
    connection_details json NOT NULL,
    action character varying NOT NULL
);


--
-- Name: integrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integrations_id_seq OWNED BY public.integrations.id;


--
-- Name: knowledge_base_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_base_chunks (
    id integer NOT NULL,
    document_id integer NOT NULL,
    organization_id integer NOT NULL,
    chunk_text text NOT NULL,
    contextualized_text text,
    chunk_index integer NOT NULL,
    chunk_metadata json NOT NULL,
    embedding_model character varying(200) NOT NULL,
    embedding_dimension integer NOT NULL,
    embedding public.vector(1536),
    token_count integer,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: knowledge_base_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knowledge_base_chunks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knowledge_base_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knowledge_base_chunks_id_seq OWNED BY public.knowledge_base_chunks.id;


--
-- Name: knowledge_base_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_base_documents (
    id integer NOT NULL,
    document_uuid character varying(36) NOT NULL,
    organization_id integer NOT NULL,
    filename character varying(500) NOT NULL,
    file_size_bytes integer,
    file_hash character varying(64),
    mime_type character varying(100),
    source_url character varying,
    total_chunks integer NOT NULL,
    processing_status public.document_processing_status DEFAULT 'pending'::public.document_processing_status NOT NULL,
    processing_error text,
    docling_metadata json NOT NULL,
    custom_metadata json NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    is_active boolean NOT NULL,
    archived_at timestamp with time zone,
    retrieval_mode character varying(20) DEFAULT 'chunked'::character varying NOT NULL,
    full_text text
);


--
-- Name: knowledge_base_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knowledge_base_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knowledge_base_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knowledge_base_documents_id_seq OWNED BY public.knowledge_base_documents.id;


--
-- Name: model_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_configurations (
    id integer NOT NULL,
    uuid character varying(36) NOT NULL,
    organization_id integer NOT NULL,
    name character varying(128) NOT NULL,
    revision integer NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    configuration json NOT NULL
);


--
-- Name: model_configurations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.model_configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: model_configurations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.model_configurations_id_seq OWNED BY public.model_configurations.id;


--
-- Name: organization_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_configurations (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    key character varying NOT NULL,
    value json NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    last_validated_at timestamp with time zone
);


--
-- Name: organization_configurations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.organization_configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: organization_configurations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.organization_configurations_id_seq OWNED BY public.organization_configurations.id;


--
-- Name: organization_usage_cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_usage_cycles (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    quota_acuity_tokens integer NOT NULL,
    used_acuity_tokens double precision NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    total_duration_seconds integer DEFAULT 0 NOT NULL,
    used_amount_usd double precision,
    quota_amount_usd double precision
);


--
-- Name: COLUMN organization_usage_cycles.quota_acuity_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_usage_cycles.quota_acuity_tokens IS 'Deprecated. MPS owns quota and credit ledger state.';


--
-- Name: COLUMN organization_usage_cycles.quota_amount_usd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_usage_cycles.quota_amount_usd IS 'Deprecated. MPS owns quota and credit ledger state.';


--
-- Name: organization_usage_cycles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.organization_usage_cycles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: organization_usage_cycles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.organization_usage_cycles_id_seq OWNED BY public.organization_usage_cycles.id;


--
-- Name: organization_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_users (
    user_id integer NOT NULL,
    organization_id integer NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id integer NOT NULL,
    provider_id character varying NOT NULL,
    created_at timestamp with time zone,
    quota_type public.quota_type DEFAULT 'monthly'::public.quota_type NOT NULL,
    quota_acuity_tokens integer DEFAULT 0 NOT NULL,
    quota_reset_day integer DEFAULT 1 NOT NULL,
    quota_start_date timestamp with time zone,
    quota_enabled boolean DEFAULT false NOT NULL,
    price_per_second_usd double precision
);


--
-- Name: COLUMN organizations.quota_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.quota_type IS 'Deprecated. MPS owns quota and credit ledger state.';


--
-- Name: COLUMN organizations.quota_acuity_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.quota_acuity_tokens IS 'Deprecated. MPS owns quota and credit ledger state.';


--
-- Name: COLUMN organizations.quota_reset_day; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.quota_reset_day IS 'Deprecated. MPS owns quota and credit ledger state.';


--
-- Name: COLUMN organizations.quota_start_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.quota_start_date IS 'Deprecated. MPS owns quota and credit ledger state.';


--
-- Name: COLUMN organizations.quota_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.quota_enabled IS 'Deprecated. MPS owns quota and credit ledger state.';


--
-- Name: organizations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.organizations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: organizations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.organizations_id_seq OWNED BY public.organizations.id;


--
-- Name: provider_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_connections (
    id integer NOT NULL,
    uuid character varying(36) NOT NULL,
    organization_id integer NOT NULL,
    name character varying(128) NOT NULL,
    revision integer NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    provider character varying(64) NOT NULL,
    credentials json NOT NULL,
    connection_settings json NOT NULL
);


--
-- Name: provider_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.provider_connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: provider_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.provider_connections_id_seq OWNED BY public.provider_connections.id;


--
-- Name: queued_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.queued_runs (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    source_uuid character varying NOT NULL,
    context_variables json NOT NULL,
    state public.queued_run_state NOT NULL,
    created_at timestamp with time zone,
    processed_at timestamp with time zone,
    retry_count integer DEFAULT 0 NOT NULL,
    parent_queued_run_id integer,
    scheduled_for timestamp with time zone,
    retry_reason character varying,
    claimed_at timestamp with time zone
);


--
-- Name: queued_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.queued_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: queued_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.queued_runs_id_seq OWNED BY public.queued_runs.id;


--
-- Name: telephony_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telephony_configurations (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    name character varying(64) NOT NULL,
    provider character varying(32) NOT NULL,
    credentials json NOT NULL,
    is_default_outbound boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    inactive boolean DEFAULT false NOT NULL,
    inactive_since timestamp with time zone,
    inactive_reason character varying(255)
);


--
-- Name: telephony_configurations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telephony_configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telephony_configurations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telephony_configurations_id_seq OWNED BY public.telephony_configurations.id;


--
-- Name: telephony_phone_numbers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telephony_phone_numbers (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    telephony_configuration_id integer NOT NULL,
    address character varying(255) NOT NULL,
    address_normalized character varying(255) NOT NULL,
    address_type character varying(16) NOT NULL,
    country_code character varying(2),
    label character varying(64),
    inbound_workflow_id integer,
    is_active boolean DEFAULT true NOT NULL,
    is_default_caller_id boolean DEFAULT false NOT NULL,
    extra_metadata json DEFAULT '{}'::json NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    telephony_trunk_id integer
);


--
-- Name: telephony_phone_numbers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telephony_phone_numbers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telephony_phone_numbers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telephony_phone_numbers_id_seq OWNED BY public.telephony_phone_numbers.id;


--
-- Name: telephony_trunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telephony_trunks (
    id integer NOT NULL,
    telephony_configuration_id integer NOT NULL,
    name character varying(64) NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    settings json NOT NULL,
    external_id character varying(255),
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: telephony_trunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telephony_trunks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telephony_trunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telephony_trunks_id_seq OWNED BY public.telephony_trunks.id;


--
-- Name: tools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tools (
    id integer NOT NULL,
    tool_uuid character varying(36) NOT NULL,
    organization_id integer NOT NULL,
    name character varying(255) NOT NULL,
    description character varying,
    category public.tool_category NOT NULL,
    icon character varying(50),
    icon_color character varying(7),
    status public.tool_status DEFAULT 'active'::public.tool_status NOT NULL,
    definition json NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: tools_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tools_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tools_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tools_id_seq OWNED BY public.tools.id;


--
-- Name: user_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_configurations (
    id integer NOT NULL,
    user_id integer,
    configuration json NOT NULL,
    last_validated_at timestamp with time zone,
    key character varying NOT NULL
);


--
-- Name: user_configurations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_configurations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_configurations_id_seq OWNED BY public.user_configurations.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    provider_id character varying NOT NULL,
    created_at timestamp with time zone,
    is_superuser boolean,
    selected_organization_id integer,
    email character varying,
    password_hash character varying
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_deliveries (
    id integer NOT NULL,
    delivery_uuid character varying(36) NOT NULL,
    workflow_run_id integer NOT NULL,
    organization_id integer NOT NULL,
    webhook_name character varying,
    endpoint_url character varying NOT NULL,
    http_method character varying NOT NULL,
    payload json NOT NULL,
    custom_headers json,
    credential_uuid character varying(36),
    webhook_node_id character varying NOT NULL,
    status public.webhook_delivery_status DEFAULT 'pending'::public.webhook_delivery_status NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    scheduled_for timestamp with time zone,
    last_status_code integer,
    last_error text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: webhook_deliveries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.webhook_deliveries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: webhook_deliveries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.webhook_deliveries_id_seq OWNED BY public.webhook_deliveries.id;


--
-- Name: workflow_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_definitions (
    id integer NOT NULL,
    workflow_hash character varying,
    workflow_json json NOT NULL,
    created_at timestamp with time zone,
    workflow_id integer,
    is_current boolean DEFAULT false NOT NULL,
    status character varying DEFAULT 'published'::character varying NOT NULL,
    version_number integer,
    published_at timestamp with time zone,
    workflow_configurations json DEFAULT '{}'::json NOT NULL,
    template_context_variables json DEFAULT '{}'::json NOT NULL,
    call_disposition_codes json DEFAULT '{}'::json NOT NULL,
    extra_metadata json DEFAULT '{}'::json NOT NULL
);


--
-- Name: workflow_definitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_definitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_definitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_definitions_id_seq OWNED BY public.workflow_definitions.id;


--
-- Name: workflow_recordings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_recordings (
    id integer NOT NULL,
    recording_id character varying(64) NOT NULL,
    workflow_id integer,
    organization_id integer NOT NULL,
    tts_provider character varying,
    tts_model character varying,
    tts_voice_id character varying,
    transcript text NOT NULL,
    storage_key character varying NOT NULL,
    storage_backend public.recording_storage_backend DEFAULT 's3'::public.recording_storage_backend NOT NULL,
    recording_metadata json DEFAULT '{}'::json NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone,
    is_active boolean NOT NULL
);


--
-- Name: workflow_recordings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_recordings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_recordings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_recordings_id_seq OWNED BY public.workflow_recordings.id;


--
-- Name: workflow_run_text_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_run_text_sessions (
    workflow_run_id integer NOT NULL,
    revision integer DEFAULT 0 NOT NULL,
    session_data json DEFAULT '{}'::json NOT NULL,
    checkpoint json DEFAULT '{}'::json NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: workflow_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_runs (
    id integer NOT NULL,
    name character varying NOT NULL,
    workflow_id integer NOT NULL,
    mode character varying(64) NOT NULL,
    created_at timestamp with time zone,
    is_completed boolean,
    recording_url character varying,
    transcript_url character varying,
    usage_info json NOT NULL,
    cost_info json NOT NULL,
    initial_context json NOT NULL,
    gathered_context json NOT NULL,
    definition_id integer,
    annotations json NOT NULL,
    campaign_id integer,
    logs json DEFAULT '{}'::json NOT NULL,
    queued_run_id integer,
    storage_backend public.storage_backend DEFAULT 's3'::public.storage_backend NOT NULL,
    state public.workflow_run_state DEFAULT 'initialized'::public.workflow_run_state NOT NULL,
    call_type public.workflow_call_type DEFAULT 'outbound'::public.workflow_call_type NOT NULL,
    public_access_token character varying(36),
    extra json DEFAULT '{}'::json NOT NULL,
    model_configuration_overrides json,
    model_configuration_snapshot json
);


--
-- Name: workflow_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_runs_id_seq OWNED BY public.workflow_runs.id;


--
-- Name: workflow_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_templates (
    id integer NOT NULL,
    template_name character varying NOT NULL,
    template_json json NOT NULL,
    created_at timestamp with time zone,
    template_description character varying NOT NULL
);


--
-- Name: workflow_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_templates_id_seq OWNED BY public.workflow_templates.id;


--
-- Name: workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflows (
    id integer NOT NULL,
    name character varying NOT NULL,
    workflow_definition json NOT NULL,
    created_at timestamp with time zone,
    user_id integer,
    template_context_variables json NOT NULL,
    call_disposition_codes json NOT NULL,
    organization_id integer,
    status public.workflow_status DEFAULT 'active'::public.workflow_status NOT NULL,
    workflow_configurations json DEFAULT '{}'::json NOT NULL,
    released_definition_id integer,
    workflow_uuid character varying(36) NOT NULL,
    folder_id integer
);


--
-- Name: workflows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflows_id_seq OWNED BY public.workflows.id;


--
-- Name: agent_triggers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_triggers ALTER COLUMN id SET DEFAULT nextval('public.agent_triggers_id_seq'::regclass);


--
-- Name: api_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys ALTER COLUMN id SET DEFAULT nextval('public.api_keys_id_seq'::regclass);


--
-- Name: campaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns ALTER COLUMN id SET DEFAULT nextval('public.campaigns_id_seq'::regclass);


--
-- Name: embed_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_sessions ALTER COLUMN id SET DEFAULT nextval('public.embed_sessions_id_seq'::regclass);


--
-- Name: embed_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_tokens ALTER COLUMN id SET DEFAULT nextval('public.embed_tokens_id_seq'::regclass);


--
-- Name: external_credentials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_credentials ALTER COLUMN id SET DEFAULT nextval('public.external_credentials_id_seq'::regclass);


--
-- Name: folders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders ALTER COLUMN id SET DEFAULT nextval('public.folders_id_seq'::regclass);


--
-- Name: integrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations ALTER COLUMN id SET DEFAULT nextval('public.integrations_id_seq'::regclass);


--
-- Name: knowledge_base_chunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_chunks ALTER COLUMN id SET DEFAULT nextval('public.knowledge_base_chunks_id_seq'::regclass);


--
-- Name: knowledge_base_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_documents ALTER COLUMN id SET DEFAULT nextval('public.knowledge_base_documents_id_seq'::regclass);


--
-- Name: model_configurations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_configurations ALTER COLUMN id SET DEFAULT nextval('public.model_configurations_id_seq'::regclass);


--
-- Name: organization_configurations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_configurations ALTER COLUMN id SET DEFAULT nextval('public.organization_configurations_id_seq'::regclass);


--
-- Name: organization_usage_cycles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_usage_cycles ALTER COLUMN id SET DEFAULT nextval('public.organization_usage_cycles_id_seq'::regclass);


--
-- Name: organizations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations ALTER COLUMN id SET DEFAULT nextval('public.organizations_id_seq'::regclass);


--
-- Name: provider_connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_connections ALTER COLUMN id SET DEFAULT nextval('public.provider_connections_id_seq'::regclass);


--
-- Name: queued_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queued_runs ALTER COLUMN id SET DEFAULT nextval('public.queued_runs_id_seq'::regclass);


--
-- Name: telephony_configurations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_configurations ALTER COLUMN id SET DEFAULT nextval('public.telephony_configurations_id_seq'::regclass);


--
-- Name: telephony_phone_numbers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_phone_numbers ALTER COLUMN id SET DEFAULT nextval('public.telephony_phone_numbers_id_seq'::regclass);


--
-- Name: telephony_trunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_trunks ALTER COLUMN id SET DEFAULT nextval('public.telephony_trunks_id_seq'::regclass);


--
-- Name: tools id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tools ALTER COLUMN id SET DEFAULT nextval('public.tools_id_seq'::regclass);


--
-- Name: user_configurations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_configurations ALTER COLUMN id SET DEFAULT nextval('public.user_configurations_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: webhook_deliveries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries ALTER COLUMN id SET DEFAULT nextval('public.webhook_deliveries_id_seq'::regclass);


--
-- Name: workflow_definitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definitions ALTER COLUMN id SET DEFAULT nextval('public.workflow_definitions_id_seq'::regclass);


--
-- Name: workflow_recordings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_recordings ALTER COLUMN id SET DEFAULT nextval('public.workflow_recordings_id_seq'::regclass);


--
-- Name: workflow_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_runs ALTER COLUMN id SET DEFAULT nextval('public.workflow_runs_id_seq'::regclass);


--
-- Name: workflow_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_templates ALTER COLUMN id SET DEFAULT nextval('public.workflow_templates_id_seq'::regclass);


--
-- Name: workflows id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows ALTER COLUMN id SET DEFAULT nextval('public.workflows_id_seq'::regclass);


--
-- Name: organization_configurations _organization_key_uc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_configurations
    ADD CONSTRAINT _organization_key_uc UNIQUE (organization_id, key);


--
-- Name: user_configurations _user_configuration_key_uc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_configurations
    ADD CONSTRAINT _user_configuration_key_uc UNIQUE (user_id, key);


--
-- Name: agent_triggers agent_triggers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_triggers
    ADD CONSTRAINT agent_triggers_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: embed_sessions embed_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_sessions
    ADD CONSTRAINT embed_sessions_pkey PRIMARY KEY (id);


--
-- Name: embed_tokens embed_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_tokens
    ADD CONSTRAINT embed_tokens_pkey PRIMARY KEY (id);


--
-- Name: external_credentials external_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_credentials
    ADD CONSTRAINT external_credentials_pkey PRIMARY KEY (id);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base_chunks knowledge_base_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_chunks
    ADD CONSTRAINT knowledge_base_chunks_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base_documents knowledge_base_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_documents
    ADD CONSTRAINT knowledge_base_documents_pkey PRIMARY KEY (id);


--
-- Name: model_configurations model_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_configurations
    ADD CONSTRAINT model_configurations_pkey PRIMARY KEY (id);


--
-- Name: model_configurations model_configurations_uuid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_configurations
    ADD CONSTRAINT model_configurations_uuid_key UNIQUE (uuid);


--
-- Name: organization_configurations organization_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_configurations
    ADD CONSTRAINT organization_configurations_pkey PRIMARY KEY (id);


--
-- Name: organization_usage_cycles organization_usage_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_usage_cycles
    ADD CONSTRAINT organization_usage_cycles_pkey PRIMARY KEY (id);


--
-- Name: organization_users organization_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_pkey PRIMARY KEY (user_id, organization_id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: provider_connections provider_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_connections
    ADD CONSTRAINT provider_connections_pkey PRIMARY KEY (id);


--
-- Name: provider_connections provider_connections_uuid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_connections
    ADD CONSTRAINT provider_connections_uuid_key UNIQUE (uuid);


--
-- Name: queued_runs queued_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queued_runs
    ADD CONSTRAINT queued_runs_pkey PRIMARY KEY (id);


--
-- Name: telephony_configurations telephony_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_configurations
    ADD CONSTRAINT telephony_configurations_pkey PRIMARY KEY (id);


--
-- Name: telephony_phone_numbers telephony_phone_numbers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_phone_numbers
    ADD CONSTRAINT telephony_phone_numbers_pkey PRIMARY KEY (id);


--
-- Name: telephony_trunks telephony_trunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_trunks
    ADD CONSTRAINT telephony_trunks_pkey PRIMARY KEY (id);


--
-- Name: tools tools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tools
    ADD CONSTRAINT tools_pkey PRIMARY KEY (id);


--
-- Name: queued_runs unique_campaign_source_retry; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queued_runs
    ADD CONSTRAINT unique_campaign_source_retry UNIQUE (campaign_id, source_uuid, retry_count);


--
-- Name: external_credentials unique_org_credential_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_credentials
    ADD CONSTRAINT unique_org_credential_name UNIQUE (organization_id, name);


--
-- Name: organization_usage_cycles unique_org_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_usage_cycles
    ADD CONSTRAINT unique_org_period UNIQUE (organization_id, period_start, period_end);


--
-- Name: folders uq_folder_org_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT uq_folder_org_name UNIQUE (organization_id, name);


--
-- Name: telephony_phone_numbers uq_phone_numbers_org_address; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_phone_numbers
    ADD CONSTRAINT uq_phone_numbers_org_address UNIQUE (organization_id, address_normalized);


--
-- Name: telephony_configurations uq_telephony_configurations_org_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_configurations
    ADD CONSTRAINT uq_telephony_configurations_org_name UNIQUE (organization_id, name);


--
-- Name: telephony_trunks uq_telephony_trunks_config_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_trunks
    ADD CONSTRAINT uq_telephony_trunks_config_name UNIQUE (telephony_configuration_id, name);


--
-- Name: webhook_deliveries uq_webhook_deliveries_run_node; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT uq_webhook_deliveries_run_node UNIQUE (workflow_run_id, webhook_node_id);


--
-- Name: workflow_recordings uq_workflow_recordings_recording_id_org; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_recordings
    ADD CONSTRAINT uq_workflow_recordings_recording_id_org UNIQUE (recording_id, organization_id);


--
-- Name: user_configurations user_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_configurations
    ADD CONSTRAINT user_configurations_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: workflow_definitions workflow_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definitions
    ADD CONSTRAINT workflow_definitions_pkey PRIMARY KEY (id);


--
-- Name: workflow_recordings workflow_recordings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_recordings
    ADD CONSTRAINT workflow_recordings_pkey PRIMARY KEY (id);


--
-- Name: workflow_run_text_sessions workflow_run_text_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_run_text_sessions
    ADD CONSTRAINT workflow_run_text_sessions_pkey PRIMARY KEY (workflow_run_id);


--
-- Name: workflow_runs workflow_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_pkey PRIMARY KEY (id);


--
-- Name: workflow_templates workflow_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_templates
    ADD CONSTRAINT workflow_templates_pkey PRIMARY KEY (id);


--
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
-- Name: idx_campaigns_active_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_active_status ON public.campaigns USING btree (state) WHERE (state = ANY (ARRAY['syncing'::public.campaign_state, 'running'::public.campaign_state, 'paused'::public.campaign_state]));


--
-- Name: idx_queued_runs_campaign_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_queued_runs_campaign_state ON public.queued_runs USING btree (campaign_id, state);


--
-- Name: idx_queued_runs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_queued_runs_created ON public.queued_runs USING btree (created_at);


--
-- Name: idx_queued_runs_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_queued_runs_scheduled ON public.queued_runs USING btree (scheduled_for);


--
-- Name: idx_queued_runs_scheduled_optimized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_queued_runs_scheduled_optimized ON public.queued_runs USING btree (campaign_id, scheduled_for) WHERE (scheduled_for IS NOT NULL);


--
-- Name: idx_queued_runs_source_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_queued_runs_source_uuid ON public.queued_runs USING btree (source_uuid);


--
-- Name: idx_usage_cycles_org_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_cycles_org_period ON public.organization_usage_cycles USING btree (organization_id, period_end);


--
-- Name: idx_webhook_deliveries_pending_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_deliveries_pending_scheduled ON public.webhook_deliveries USING btree (scheduled_for) WHERE (status = 'pending'::public.webhook_delivery_status);


--
-- Name: idx_webhook_deliveries_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_deliveries_run ON public.webhook_deliveries USING btree (workflow_run_id);


--
-- Name: idx_workflow_runs_call_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_runs_call_id ON public.workflow_runs USING btree (((gathered_context ->> 'call_id'::text))) WHERE ((gathered_context ->> 'call_id'::text) IS NOT NULL);


--
-- Name: idx_workflow_runs_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_runs_campaign_id ON public.workflow_runs USING btree (campaign_id);


--
-- Name: idx_workflow_runs_pending_completion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_runs_pending_completion ON public.workflow_runs USING btree (id) WHERE ((is_completed IS TRUE) AND (((extra -> 'workflow_completion'::text) ->> 'status'::text) = ANY (ARRAY['pending'::text, 'running'::text])));


--
-- Name: idx_workflow_runs_public_access_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_workflow_runs_public_access_token ON public.workflow_runs USING btree (public_access_token) WHERE (public_access_token IS NOT NULL);


--
-- Name: idx_workflow_runs_workflow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_runs_workflow_id ON public.workflow_runs USING btree (workflow_id);


--
-- Name: ix_agent_triggers_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_agent_triggers_state ON public.agent_triggers USING btree (state);


--
-- Name: ix_agent_triggers_trigger_path; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_agent_triggers_trigger_path ON public.agent_triggers USING btree (trigger_path);


--
-- Name: ix_agent_triggers_workflow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_agent_triggers_workflow_id ON public.agent_triggers USING btree (workflow_id);


--
-- Name: ix_api_keys_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_api_keys_active ON public.api_keys USING btree (is_active);


--
-- Name: ix_api_keys_key_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_api_keys_key_hash ON public.api_keys USING btree (key_hash);


--
-- Name: ix_api_keys_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_api_keys_organization_id ON public.api_keys USING btree (organization_id);


--
-- Name: ix_campaigns_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_campaigns_name ON public.campaigns USING btree (name);


--
-- Name: ix_campaigns_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_campaigns_org_id ON public.campaigns USING btree (organization_id);


--
-- Name: ix_campaigns_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_campaigns_state ON public.campaigns USING btree (state);


--
-- Name: ix_campaigns_telephony_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_campaigns_telephony_config ON public.campaigns USING btree (telephony_configuration_id) WHERE (telephony_configuration_id IS NOT NULL);


--
-- Name: ix_campaigns_workflow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_campaigns_workflow_id ON public.campaigns USING btree (workflow_id);


--
-- Name: ix_embed_sessions_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_embed_sessions_expires_at ON public.embed_sessions USING btree (expires_at);


--
-- Name: ix_embed_sessions_session_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_embed_sessions_session_token ON public.embed_sessions USING btree (session_token);


--
-- Name: ix_embed_tokens_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_embed_tokens_is_active ON public.embed_tokens USING btree (is_active);


--
-- Name: ix_embed_tokens_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_embed_tokens_organization_id ON public.embed_tokens USING btree (organization_id);


--
-- Name: ix_embed_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_embed_tokens_token ON public.embed_tokens USING btree (token);


--
-- Name: ix_embed_tokens_workflow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_embed_tokens_workflow_id ON public.embed_tokens USING btree (workflow_id);


--
-- Name: ix_external_credentials_credential_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_external_credentials_credential_uuid ON public.external_credentials USING btree (credential_uuid);


--
-- Name: ix_folders_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_folders_organization_id ON public.folders USING btree (organization_id);


--
-- Name: ix_integrations_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_integrations_integration_id ON public.integrations USING btree (integration_id);


--
-- Name: ix_kb_chunks_chunk_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_kb_chunks_chunk_index ON public.knowledge_base_chunks USING btree (chunk_index);


--
-- Name: ix_kb_chunks_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_kb_chunks_document_id ON public.knowledge_base_chunks USING btree (document_id);


--
-- Name: ix_kb_chunks_embedding_ivfflat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_kb_chunks_embedding_ivfflat ON public.knowledge_base_chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: ix_kb_chunks_embedding_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_kb_chunks_embedding_model ON public.knowledge_base_chunks USING btree (embedding_model);


--
-- Name: ix_kb_chunks_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_kb_chunks_organization_id ON public.knowledge_base_chunks USING btree (organization_id);


--
-- Name: ix_kb_documents_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_kb_documents_created_at ON public.knowledge_base_documents USING btree (created_at);


--
-- Name: ix_kb_documents_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_kb_documents_organization_id ON public.knowledge_base_documents USING btree (organization_id);


--
-- Name: ix_kb_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_kb_documents_status ON public.knowledge_base_documents USING btree (processing_status);


--
-- Name: ix_kb_documents_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_kb_documents_uuid ON public.knowledge_base_documents USING btree (document_uuid);


--
-- Name: ix_knowledge_base_documents_document_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_knowledge_base_documents_document_uuid ON public.knowledge_base_documents USING btree (document_uuid);


--
-- Name: ix_model_configurations_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_model_configurations_organization_id ON public.model_configurations USING btree (organization_id);


--
-- Name: ix_organization_configurations_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_organization_configurations_id ON public.organization_configurations USING btree (id);


--
-- Name: ix_organization_configurations_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_organization_configurations_organization_id ON public.organization_configurations USING btree (organization_id);


--
-- Name: ix_organization_usage_cycles_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_organization_usage_cycles_id ON public.organization_usage_cycles USING btree (id);


--
-- Name: ix_organizations_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_organizations_provider_id ON public.organizations USING btree (provider_id);


--
-- Name: ix_phone_numbers_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_phone_numbers_config ON public.telephony_phone_numbers USING btree (telephony_configuration_id);


--
-- Name: ix_phone_numbers_inbound_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_phone_numbers_inbound_lookup ON public.telephony_phone_numbers USING btree (address_normalized, organization_id) WHERE (is_active = true);


--
-- Name: ix_phone_numbers_trunk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_phone_numbers_trunk ON public.telephony_phone_numbers USING btree (telephony_trunk_id) WHERE (telephony_trunk_id IS NOT NULL);


--
-- Name: ix_phone_numbers_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_phone_numbers_workflow ON public.telephony_phone_numbers USING btree (inbound_workflow_id) WHERE (inbound_workflow_id IS NOT NULL);


--
-- Name: ix_provider_connections_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_provider_connections_organization_id ON public.provider_connections USING btree (organization_id);


--
-- Name: ix_telephony_configurations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_telephony_configurations_org ON public.telephony_configurations USING btree (organization_id);


--
-- Name: ix_telephony_trunks_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_telephony_trunks_config ON public.telephony_trunks USING btree (telephony_configuration_id);


--
-- Name: ix_telephony_trunks_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_telephony_trunks_id ON public.telephony_trunks USING btree (id);


--
-- Name: ix_tools_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tools_category ON public.tools USING btree (category);


--
-- Name: ix_tools_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tools_organization_id ON public.tools USING btree (organization_id);


--
-- Name: ix_tools_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tools_status ON public.tools USING btree (status);


--
-- Name: ix_tools_tool_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_tools_tool_uuid ON public.tools USING btree (tool_uuid);


--
-- Name: ix_tools_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tools_uuid ON public.tools USING btree (tool_uuid);


--
-- Name: ix_users_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_email_lower ON public.users USING btree (lower((email)::text)) WHERE (email IS NOT NULL);


--
-- Name: ix_users_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_provider_id ON public.users USING btree (provider_id);


--
-- Name: ix_webhook_credentials_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_webhook_credentials_organization_id ON public.external_credentials USING btree (organization_id);


--
-- Name: ix_webhook_credentials_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_webhook_credentials_uuid ON public.external_credentials USING btree (credential_uuid);


--
-- Name: ix_webhook_deliveries_delivery_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_webhook_deliveries_delivery_uuid ON public.webhook_deliveries USING btree (delivery_uuid);


--
-- Name: ix_workflow_definitions_workflow_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_workflow_definitions_workflow_status ON public.workflow_definitions USING btree (workflow_id, status);


--
-- Name: ix_workflow_recordings_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_workflow_recordings_org_id ON public.workflow_recordings USING btree (organization_id);


--
-- Name: ix_workflow_recordings_recording_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_workflow_recordings_recording_id ON public.workflow_recordings USING btree (recording_id);


--
-- Name: ix_workflow_recordings_workflow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_workflow_recordings_workflow_id ON public.workflow_recordings USING btree (workflow_id);


--
-- Name: ix_workflow_run_text_sessions_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_workflow_run_text_sessions_updated_at ON public.workflow_run_text_sessions USING btree (updated_at);


--
-- Name: ix_workflow_templates_template_description; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_workflow_templates_template_description ON public.workflow_templates USING btree (template_description);


--
-- Name: ix_workflow_templates_template_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_workflow_templates_template_name ON public.workflow_templates USING btree (template_name);


--
-- Name: ix_workflows_folder_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_workflows_folder_id ON public.workflows USING btree (folder_id);


--
-- Name: ix_workflows_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_workflows_name ON public.workflows USING btree (name);


--
-- Name: ix_workflows_workflow_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_workflows_workflow_uuid ON public.workflows USING btree (workflow_uuid);


--
-- Name: uq_phone_numbers_default_caller; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_phone_numbers_default_caller ON public.telephony_phone_numbers USING btree (telephony_configuration_id) WHERE (is_default_caller_id = true);


--
-- Name: uq_telephony_configurations_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_telephony_configurations_default ON public.telephony_configurations USING btree (organization_id) WHERE (is_default_outbound = true);


--
-- Name: agent_triggers agent_triggers_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_triggers
    ADD CONSTRAINT agent_triggers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: agent_triggers agent_triggers_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_triggers
    ADD CONSTRAINT agent_triggers_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: api_keys api_keys_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: campaigns campaigns_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: campaigns campaigns_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id);


--
-- Name: embed_sessions embed_sessions_embed_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_sessions
    ADD CONSTRAINT embed_sessions_embed_token_id_fkey FOREIGN KEY (embed_token_id) REFERENCES public.embed_tokens(id) ON DELETE CASCADE;


--
-- Name: embed_sessions embed_sessions_workflow_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_sessions
    ADD CONSTRAINT embed_sessions_workflow_run_id_fkey FOREIGN KEY (workflow_run_id) REFERENCES public.workflow_runs(id) ON DELETE CASCADE;


--
-- Name: embed_tokens embed_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_tokens
    ADD CONSTRAINT embed_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: embed_tokens embed_tokens_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_tokens
    ADD CONSTRAINT embed_tokens_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: embed_tokens embed_tokens_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embed_tokens
    ADD CONSTRAINT embed_tokens_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;


--
-- Name: external_credentials external_credentials_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_credentials
    ADD CONSTRAINT external_credentials_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: external_credentials external_credentials_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_credentials
    ADD CONSTRAINT external_credentials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: campaigns fk_campaigns_telephony_configuration_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT fk_campaigns_telephony_configuration_id FOREIGN KEY (telephony_configuration_id) REFERENCES public.telephony_configurations(id);


--
-- Name: telephony_phone_numbers fk_phone_numbers_trunk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_phone_numbers
    ADD CONSTRAINT fk_phone_numbers_trunk FOREIGN KEY (telephony_trunk_id) REFERENCES public.telephony_trunks(id) ON DELETE SET NULL;


--
-- Name: workflows fk_workflows_folder_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT fk_workflows_folder_id FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;


--
-- Name: folders folders_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: integrations integrations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: integrations integrations_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_organisation_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: knowledge_base_chunks knowledge_base_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_chunks
    ADD CONSTRAINT knowledge_base_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_base_documents(id) ON DELETE CASCADE;


--
-- Name: knowledge_base_chunks knowledge_base_chunks_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_chunks
    ADD CONSTRAINT knowledge_base_chunks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: knowledge_base_documents knowledge_base_documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_documents
    ADD CONSTRAINT knowledge_base_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: knowledge_base_documents knowledge_base_documents_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_documents
    ADD CONSTRAINT knowledge_base_documents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: model_configurations model_configurations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_configurations
    ADD CONSTRAINT model_configurations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_configurations organization_configurations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_configurations
    ADD CONSTRAINT organization_configurations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_usage_cycles organization_usage_cycles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_usage_cycles
    ADD CONSTRAINT organization_usage_cycles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: organization_users organization_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: organization_users organization_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: provider_connections provider_connections_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_connections
    ADD CONSTRAINT provider_connections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: queued_runs queued_runs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queued_runs
    ADD CONSTRAINT queued_runs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: queued_runs queued_runs_parent_queued_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queued_runs
    ADD CONSTRAINT queued_runs_parent_queued_run_id_fkey FOREIGN KEY (parent_queued_run_id) REFERENCES public.queued_runs(id);


--
-- Name: telephony_configurations telephony_configurations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_configurations
    ADD CONSTRAINT telephony_configurations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: telephony_phone_numbers telephony_phone_numbers_inbound_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_phone_numbers
    ADD CONSTRAINT telephony_phone_numbers_inbound_workflow_id_fkey FOREIGN KEY (inbound_workflow_id) REFERENCES public.workflows(id) ON DELETE SET NULL;


--
-- Name: telephony_phone_numbers telephony_phone_numbers_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_phone_numbers
    ADD CONSTRAINT telephony_phone_numbers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: telephony_phone_numbers telephony_phone_numbers_telephony_configuration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_phone_numbers
    ADD CONSTRAINT telephony_phone_numbers_telephony_configuration_id_fkey FOREIGN KEY (telephony_configuration_id) REFERENCES public.telephony_configurations(id) ON DELETE CASCADE;


--
-- Name: telephony_trunks telephony_trunks_telephony_configuration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telephony_trunks
    ADD CONSTRAINT telephony_trunks_telephony_configuration_id_fkey FOREIGN KEY (telephony_configuration_id) REFERENCES public.telephony_configurations(id) ON DELETE CASCADE;


--
-- Name: tools tools_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tools
    ADD CONSTRAINT tools_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: tools tools_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tools
    ADD CONSTRAINT tools_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_configurations user_configurations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_configurations
    ADD CONSTRAINT user_configurations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: users users_selected_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_selected_organization_id_fkey FOREIGN KEY (selected_organization_id) REFERENCES public.organizations(id);


--
-- Name: webhook_deliveries webhook_deliveries_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: webhook_deliveries webhook_deliveries_workflow_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_workflow_run_id_fkey FOREIGN KEY (workflow_run_id) REFERENCES public.workflow_runs(id) ON DELETE CASCADE;


--
-- Name: workflow_definitions workflow_definitions_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definitions
    ADD CONSTRAINT workflow_definitions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id);


--
-- Name: workflow_recordings workflow_recordings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_recordings
    ADD CONSTRAINT workflow_recordings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: workflow_recordings workflow_recordings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_recordings
    ADD CONSTRAINT workflow_recordings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: workflow_recordings workflow_recordings_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_recordings
    ADD CONSTRAINT workflow_recordings_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;


--
-- Name: workflow_run_text_sessions workflow_run_text_sessions_workflow_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_run_text_sessions
    ADD CONSTRAINT workflow_run_text_sessions_workflow_run_id_fkey FOREIGN KEY (workflow_run_id) REFERENCES public.workflow_runs(id) ON DELETE CASCADE;


--
-- Name: workflow_runs workflow_runs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id);


--
-- Name: workflow_runs workflow_runs_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.workflow_definitions(id);


--
-- Name: workflow_runs workflow_runs_queued_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_queued_run_id_fkey FOREIGN KEY (queued_run_id) REFERENCES public.queued_runs(id);


--
-- Name: workflow_runs workflow_runs_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id);


--
-- Name: workflows workflows_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: workflows workflows_released_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_released_definition_id_fkey FOREIGN KEY (released_definition_id) REFERENCES public.workflow_definitions(id);


--
-- Name: workflows workflows_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 8hTAzSsfqQXn3kicpHwzR8DUCaJ4G2AVq9oFt2afobqP618eF1ceFHghQlNMTlu

