--
-- PostgreSQL database dump
--

\restrict zR46Tmt5kqCmfzxkppxDbcqIvgzoNTsOQ0lAtdaSAyDn1qTVY32ge89gQQI76Hp

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

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
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: fy_of_date(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fy_of_date(d date) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM d) >= 4
      THEN EXTRACT(YEAR FROM d)::text || '-' || LPAD((EXTRACT(YEAR FROM d)::int + 1 - 2000)::text, 2, '0')
    ELSE (EXTRACT(YEAR FROM d)::int - 1)::text || '-' || LPAD((EXTRACT(YEAR FROM d)::int - 2000)::text, 2, '0')
  END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    target text NOT NULL,
    target_id uuid NOT NULL,
    payload jsonb NOT NULL,
    label text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by uuid NOT NULL,
    resolved_by uuid,
    requested_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at timestamp(3) without time zone,
    legacy_id text
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    target text NOT NULL,
    target_id uuid,
    label text,
    details jsonb,
    actor_id uuid,
    actor_name text NOT NULL,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    legacy_id text
);


--
-- Name: field_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.field_settings (
    key text NOT NULL,
    required boolean DEFAULT false NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: financial_years; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_years (
    label text NOT NULL,
    created_by uuid,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: freight_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.freight_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date date NOT NULL,
    transporter_id uuid NOT NULL,
    party_id uuid NOT NULL,
    item_id uuid NOT NULL,
    qty numeric(14,3) NOT NULL,
    freight numeric(14,2) NOT NULL,
    freight_rate numeric(10,2) DEFAULT 0 NOT NULL,
    inward_id uuid,
    outward_id uuid,
    inv_no text,
    note text,
    legacy_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: handling_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.handling_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date date NOT NULL,
    handling_agent_id uuid NOT NULL,
    party_id uuid NOT NULL,
    item_id uuid NOT NULL,
    qty numeric(14,3) NOT NULL,
    amount numeric(14,2) NOT NULL,
    handling_rate numeric(10,2) DEFAULT 0 NOT NULL,
    source_id uuid NOT NULL,
    source_kind text NOT NULL,
    inv_no text,
    note text,
    legacy_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: inward; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inward (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date date NOT NULL,
    financial_year text GENERATED ALWAYS AS (public.fy_of_date(date)) STORED,
    party_id uuid NOT NULL,
    item_id uuid NOT NULL,
    qty numeric(14,3) NOT NULL,
    rate numeric(14,2) NOT NULL,
    gst_pct numeric(5,2) DEFAULT 0 NOT NULL,
    gst numeric(14,2) DEFAULT 0 NOT NULL,
    handling_rate numeric(10,2) DEFAULT 0 NOT NULL,
    handling numeric(14,2) DEFAULT 0 NOT NULL,
    handling_agent_id uuid,
    amount numeric(14,2) NOT NULL,
    inv_no text,
    inv_date date,
    delivery_type text,
    transporter_id uuid,
    freight_rate numeric(10,2) DEFAULT 0 NOT NULL,
    freight numeric(14,2) DEFAULT 0 NOT NULL,
    vehicle text,
    note text,
    created_by uuid,
    legacy_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    status text DEFAULT 'received'::text NOT NULL
);


--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text,
    unit text NOT NULL,
    code text,
    rate numeric(14,2) DEFAULT 0 NOT NULL,
    opening numeric(14,3) DEFAULT 0 NOT NULL,
    reorder numeric(14,3) DEFAULT 0 NOT NULL,
    rate_date date,
    legacy_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: login_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    latitude double precision,
    longitude double precision,
    accuracy double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: outward; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outward (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date date NOT NULL,
    financial_year text GENERATED ALWAYS AS (public.fy_of_date(date)) STORED,
    party_id uuid NOT NULL,
    item_id uuid NOT NULL,
    qty numeric(14,3) NOT NULL,
    rate numeric(14,2) NOT NULL,
    freight_rate numeric(10,2) DEFAULT 0 NOT NULL,
    freight numeric(14,2) DEFAULT 0 NOT NULL,
    gst_pct numeric(5,2) DEFAULT 0 NOT NULL,
    gst numeric(14,2) DEFAULT 0 NOT NULL,
    handling_rate numeric(10,2) DEFAULT 0 NOT NULL,
    handling numeric(14,2) DEFAULT 0 NOT NULL,
    handling_agent_id uuid,
    amount numeric(14,2) NOT NULL,
    pay_status text DEFAULT 'pending'::text NOT NULL,
    credit_days integer DEFAULT 0 NOT NULL,
    inv_no text,
    inv_date date,
    delivery_type text,
    transporter_id uuid,
    vehicle text,
    fulfil text DEFAULT 'pending'::text NOT NULL,
    prev_fulfil text,
    dispatched_at date,
    delivered_at date,
    cancelled_at date,
    cancelled_by uuid,
    note text,
    created_by uuid,
    legacy_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    sales_person_id uuid,
    phone text,
    email text,
    gst text,
    opening numeric(14,2) DEFAULT 0 NOT NULL,
    credit_days integer DEFAULT 0 NOT NULL,
    default_freight numeric(10,2) DEFAULT 0 NOT NULL,
    address text,
    location_url text,
    vehicle text,
    legacy_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: payment_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    outward_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date date NOT NULL,
    financial_year text GENERATED ALWAYS AS (public.fy_of_date(date)) STORED,
    party_id uuid NOT NULL,
    dir text NOT NULL,
    amount numeric(14,2) NOT NULL,
    mode text NOT NULL,
    allocations jsonb,
    note text,
    created_by uuid,
    legacy_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    device_label text,
    expires_at timestamp(3) without time zone NOT NULL,
    revoked_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sales_persons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_persons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    legacy_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: salesperson_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salesperson_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sales_person_id uuid NOT NULL,
    date date NOT NULL,
    amount numeric(14,2) NOT NULL,
    expense_for text NOT NULL,
    attachment text,
    attachment_name text,
    created_by_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    username public.citext NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    security jsonb DEFAULT '{}'::jsonb NOT NULL,
    legacy_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    is_primary boolean DEFAULT false NOT NULL
);


--
-- Name: whatsapp_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_templates (
    key text NOT NULL,
    template text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: field_settings field_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_settings
    ADD CONSTRAINT field_settings_pkey PRIMARY KEY (key);


--
-- Name: financial_years financial_years_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_years
    ADD CONSTRAINT financial_years_pkey PRIMARY KEY (label);


--
-- Name: freight_entries freight_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freight_entries
    ADD CONSTRAINT freight_entries_pkey PRIMARY KEY (id);


--
-- Name: handling_entries handling_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handling_entries
    ADD CONSTRAINT handling_entries_pkey PRIMARY KEY (id);


--
-- Name: inward inward_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inward
    ADD CONSTRAINT inward_pkey PRIMARY KEY (id);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: login_locations login_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_locations
    ADD CONSTRAINT login_locations_pkey PRIMARY KEY (id);


--
-- Name: outward outward_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outward
    ADD CONSTRAINT outward_pkey PRIMARY KEY (id);


--
-- Name: parties parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (id);


--
-- Name: payment_allocations payment_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_allocations
    ADD CONSTRAINT payment_allocations_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: sales_persons sales_persons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_persons
    ADD CONSTRAINT sales_persons_pkey PRIMARY KEY (id);


--
-- Name: salesperson_expenses salesperson_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_expenses
    ADD CONSTRAINT salesperson_expenses_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_templates whatsapp_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (key);


--
-- Name: approval_requests_legacy_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX approval_requests_legacy_id_key ON public.approval_requests USING btree (legacy_id);


--
-- Name: approval_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_requests_status_idx ON public.approval_requests USING btree (status);


--
-- Name: audit_log_legacy_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX audit_log_legacy_id_key ON public.audit_log USING btree (legacy_id);


--
-- Name: audit_log_target_target_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_target_target_id_idx ON public.audit_log USING btree (target, target_id);


--
-- Name: audit_log_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_timestamp_idx ON public.audit_log USING btree ("timestamp" DESC);


--
-- Name: freight_entries_inward_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX freight_entries_inward_id_idx ON public.freight_entries USING btree (inward_id);


--
-- Name: freight_entries_legacy_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX freight_entries_legacy_id_key ON public.freight_entries USING btree (legacy_id);


--
-- Name: freight_entries_outward_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX freight_entries_outward_id_idx ON public.freight_entries USING btree (outward_id);


--
-- Name: freight_entries_transporter_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX freight_entries_transporter_id_idx ON public.freight_entries USING btree (transporter_id);


--
-- Name: handling_entries_handling_agent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX handling_entries_handling_agent_id_idx ON public.handling_entries USING btree (handling_agent_id);


--
-- Name: handling_entries_legacy_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX handling_entries_legacy_id_key ON public.handling_entries USING btree (legacy_id);


--
-- Name: handling_entries_source_id_source_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX handling_entries_source_id_source_kind_idx ON public.handling_entries USING btree (source_id, source_kind);


--
-- Name: idx_login_locations_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_locations_created ON public.login_locations USING btree (created_at DESC);


--
-- Name: idx_salesperson_expenses_sp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salesperson_expenses_sp ON public.salesperson_expenses USING btree (sales_person_id);


--
-- Name: inward_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inward_date_idx ON public.inward USING btree (date);


--
-- Name: inward_financial_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inward_financial_year_idx ON public.inward USING btree (financial_year);


--
-- Name: inward_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inward_item_id_idx ON public.inward USING btree (item_id);


--
-- Name: inward_legacy_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inward_legacy_id_key ON public.inward USING btree (legacy_id);


--
-- Name: inward_party_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inward_party_id_idx ON public.inward USING btree (party_id);


--
-- Name: items_legacy_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX items_legacy_id_key ON public.items USING btree (legacy_id);


--
-- Name: outward_financial_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outward_financial_year_idx ON public.outward USING btree (financial_year);


--
-- Name: outward_fulfil_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outward_fulfil_idx ON public.outward USING btree (fulfil);


--
-- Name: outward_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outward_item_id_idx ON public.outward USING btree (item_id);


--
-- Name: outward_legacy_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outward_legacy_id_key ON public.outward USING btree (legacy_id);


--
-- Name: outward_party_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outward_party_id_idx ON public.outward USING btree (party_id);


--
-- Name: outward_pay_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outward_pay_status_idx ON public.outward USING btree (pay_status);


--
-- Name: parties_legacy_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX parties_legacy_id_key ON public.parties USING btree (legacy_id);


--
-- Name: parties_sales_person_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX parties_sales_person_id_idx ON public.parties USING btree (sales_person_id);


--
-- Name: parties_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX parties_type_idx ON public.parties USING btree (type);


--
-- Name: payment_allocations_outward_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_allocations_outward_id_idx ON public.payment_allocations USING btree (outward_id);


--
-- Name: payment_allocations_payment_id_outward_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payment_allocations_payment_id_outward_id_key ON public.payment_allocations USING btree (payment_id, outward_id);


--
-- Name: payments_financial_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_financial_year_idx ON public.payments USING btree (financial_year);


--
-- Name: payments_legacy_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_legacy_id_key ON public.payments USING btree (legacy_id);


--
-- Name: payments_party_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_party_id_idx ON public.payments USING btree (party_id);


--
-- Name: refresh_tokens_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX refresh_tokens_token_hash_key ON public.refresh_tokens USING btree (token_hash);


--
-- Name: refresh_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_user_id_idx ON public.refresh_tokens USING btree (user_id);


--
-- Name: sales_persons_legacy_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sales_persons_legacy_id_key ON public.sales_persons USING btree (legacy_id);


--
-- Name: users_legacy_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_legacy_id_key ON public.users USING btree (legacy_id);


--
-- Name: users_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_username_key ON public.users USING btree (username);


--
-- Name: approval_requests approval_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: approval_requests approval_requests_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: audit_log audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: financial_years financial_years_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_years
    ADD CONSTRAINT financial_years_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: freight_entries freight_entries_inward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freight_entries
    ADD CONSTRAINT freight_entries_inward_id_fkey FOREIGN KEY (inward_id) REFERENCES public.inward(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: freight_entries freight_entries_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freight_entries
    ADD CONSTRAINT freight_entries_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: freight_entries freight_entries_outward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freight_entries
    ADD CONSTRAINT freight_entries_outward_id_fkey FOREIGN KEY (outward_id) REFERENCES public.outward(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: freight_entries freight_entries_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freight_entries
    ADD CONSTRAINT freight_entries_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: freight_entries freight_entries_transporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freight_entries
    ADD CONSTRAINT freight_entries_transporter_id_fkey FOREIGN KEY (transporter_id) REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: handling_entries handling_entries_handling_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handling_entries
    ADD CONSTRAINT handling_entries_handling_agent_id_fkey FOREIGN KEY (handling_agent_id) REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: handling_entries handling_entries_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handling_entries
    ADD CONSTRAINT handling_entries_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: handling_entries handling_entries_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handling_entries
    ADD CONSTRAINT handling_entries_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inward inward_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inward
    ADD CONSTRAINT inward_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: inward inward_handling_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inward
    ADD CONSTRAINT inward_handling_agent_id_fkey FOREIGN KEY (handling_agent_id) REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: inward inward_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inward
    ADD CONSTRAINT inward_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inward inward_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inward
    ADD CONSTRAINT inward_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inward inward_transporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inward
    ADD CONSTRAINT inward_transporter_id_fkey FOREIGN KEY (transporter_id) REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: login_locations login_locations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_locations
    ADD CONSTRAINT login_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: outward outward_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outward
    ADD CONSTRAINT outward_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: outward outward_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outward
    ADD CONSTRAINT outward_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: outward outward_handling_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outward
    ADD CONSTRAINT outward_handling_agent_id_fkey FOREIGN KEY (handling_agent_id) REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: outward outward_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outward
    ADD CONSTRAINT outward_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: outward outward_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outward
    ADD CONSTRAINT outward_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: outward outward_transporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outward
    ADD CONSTRAINT outward_transporter_id_fkey FOREIGN KEY (transporter_id) REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: parties parties_sales_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_sales_person_id_fkey FOREIGN KEY (sales_person_id) REFERENCES public.sales_persons(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payment_allocations payment_allocations_outward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_allocations
    ADD CONSTRAINT payment_allocations_outward_id_fkey FOREIGN KEY (outward_id) REFERENCES public.outward(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: payment_allocations payment_allocations_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_allocations
    ADD CONSTRAINT payment_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payments payments_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: salesperson_expenses salesperson_expenses_sales_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_expenses
    ADD CONSTRAINT salesperson_expenses_sales_person_id_fkey FOREIGN KEY (sales_person_id) REFERENCES public.sales_persons(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict zR46Tmt5kqCmfzxkppxDbcqIvgzoNTsOQ0lAtdaSAyDn1qTVY32ge89gQQI76Hp

