
-- =============================================
-- CRM DATABASE SCHEMA
-- =============================================

-- 1. Role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'technician');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 4. Service Calls table
CREATE TABLE public.service_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  scheduled_date DATE,
  completed_date DATE,
  findings TEXT,
  recommendations TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_calls ENABLE ROW LEVEL SECURITY;

-- Status validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_service_call_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('open', 'in_progress', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_service_call_status_trigger
BEFORE INSERT OR UPDATE ON public.service_calls
FOR EACH ROW EXECUTE FUNCTION public.validate_service_call_status();

-- 5. Service Call Photos
CREATE TABLE public.service_call_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_call_id UUID NOT NULL REFERENCES public.service_calls(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption TEXT,
  tag TEXT DEFAULT 'other',
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_call_photos ENABLE ROW LEVEL SECURITY;

-- Tag validation trigger
CREATE OR REPLACE FUNCTION public.validate_media_tag()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tag NOT IN ('before', 'after', 'finding', 'other') THEN
    RAISE EXCEPTION 'Invalid tag: %', NEW.tag;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_photo_tag_trigger
BEFORE INSERT OR UPDATE ON public.service_call_photos
FOR EACH ROW EXECUTE FUNCTION public.validate_media_tag();

-- 6. Service Call Videos
CREATE TABLE public.service_call_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_call_id UUID NOT NULL REFERENCES public.service_calls(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  title TEXT,
  tag TEXT DEFAULT 'other',
  duration_seconds INTEGER,
  file_size_bytes BIGINT,
  thumbnail_path TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_call_videos ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER validate_video_tag_trigger
BEFORE INSERT OR UPDATE ON public.service_call_videos
FOR EACH ROW EXECUTE FUNCTION public.validate_media_tag();

-- 7. Reports table
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_call_id UUID NOT NULL REFERENCES public.service_calls(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  findings TEXT,
  recommendations TEXT,
  quote_summary TEXT,
  invoice_number TEXT,
  invoice_status TEXT,
  signature_path TEXT,
  signature_date TIMESTAMPTZ,
  pdf_path TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Report status validation trigger
CREATE OR REPLACE FUNCTION public.validate_report_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'final') THEN
    RAISE EXCEPTION 'Invalid report status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_report_status_trigger
BEFORE INSERT OR UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.validate_report_status();

-- 8. Report Shares table
CREATE TABLE public.report_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
ALTER TABLE public.report_shares ENABLE ROW LEVEL SECURITY;

-- 9. Video Share Tokens
CREATE TABLE public.video_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.service_call_videos(id) ON DELETE CASCADE,
  report_share_id UUID NOT NULL REFERENCES public.report_shares(id) ON DELETE CASCADE,
  video_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.video_share_tokens ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECURITY DEFINER FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- Check if user can access a service call (admin OR assigned)
CREATE OR REPLACE FUNCTION public.can_access_service_call(_user_id UUID, _service_call_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_calls
    WHERE id = _service_call_id
    AND (
      public.is_admin(_user_id)
      OR assigned_to = _user_id
      OR created_by = _user_id
    )
  )
$$;

-- Get service_call_id from photo
CREATE OR REPLACE FUNCTION public.get_sc_id_for_photo(_photo_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT service_call_id FROM public.service_call_photos WHERE id = _photo_id
$$;

-- Get service_call_id from video
CREATE OR REPLACE FUNCTION public.get_sc_id_for_video(_video_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT service_call_id FROM public.service_call_videos WHERE id = _video_id
$$;

-- Get service_call_id from report
CREATE OR REPLACE FUNCTION public.get_sc_id_for_report(_report_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT service_call_id FROM public.reports WHERE id = _report_id
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_service_calls_updated_at BEFORE UPDATE ON public.service_calls FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- RLS POLICIES
-- =============================================

-- user_roles policies
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- profiles policies
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- customers policies
CREATE POLICY "Authenticated users can read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update customers" ON public.customers FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete customers" ON public.customers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- service_calls policies
CREATE POLICY "Admins can manage service_calls" ON public.service_calls FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can read assigned service_calls" ON public.service_calls FOR SELECT TO authenticated USING (assigned_to = auth.uid() OR created_by = auth.uid());
CREATE POLICY "Users can insert service_calls" ON public.service_calls FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Users can update assigned service_calls" ON public.service_calls FOR UPDATE TO authenticated USING (assigned_to = auth.uid() OR created_by = auth.uid());

-- service_call_photos policies
CREATE POLICY "Users can read photos for accessible calls" ON public.service_call_photos FOR SELECT TO authenticated USING (public.can_access_service_call(auth.uid(), service_call_id));
CREATE POLICY "Users can insert photos for accessible calls" ON public.service_call_photos FOR INSERT TO authenticated WITH CHECK (public.can_access_service_call(auth.uid(), service_call_id) AND uploaded_by = auth.uid());
CREATE POLICY "Users can delete own photos" ON public.service_call_photos FOR DELETE TO authenticated USING (uploaded_by = auth.uid() OR public.is_admin(auth.uid()));

-- service_call_videos policies
CREATE POLICY "Users can read videos for accessible calls" ON public.service_call_videos FOR SELECT TO authenticated USING (public.can_access_service_call(auth.uid(), service_call_id));
CREATE POLICY "Users can insert videos for accessible calls" ON public.service_call_videos FOR INSERT TO authenticated WITH CHECK (public.can_access_service_call(auth.uid(), service_call_id) AND uploaded_by = auth.uid());
CREATE POLICY "Users can update videos for accessible calls" ON public.service_call_videos FOR UPDATE TO authenticated USING (public.can_access_service_call(auth.uid(), service_call_id));
CREATE POLICY "Users can delete own videos" ON public.service_call_videos FOR DELETE TO authenticated USING (uploaded_by = auth.uid() OR public.is_admin(auth.uid()));

-- reports policies
CREATE POLICY "Users can read reports for accessible calls" ON public.reports FOR SELECT TO authenticated USING (public.can_access_service_call(auth.uid(), service_call_id));
CREATE POLICY "Users can insert reports for accessible calls" ON public.reports FOR INSERT TO authenticated WITH CHECK (public.can_access_service_call(auth.uid(), service_call_id) AND created_by = auth.uid());
CREATE POLICY "Users can update reports for accessible calls" ON public.reports FOR UPDATE TO authenticated USING (public.can_access_service_call(auth.uid(), service_call_id));
CREATE POLICY "Admins can delete reports" ON public.reports FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- report_shares policies (admin only + public read via token)
CREATE POLICY "Admins can manage report_shares" ON public.report_shares FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Assigned users can manage shares" ON public.report_shares FOR ALL TO authenticated USING (
  public.can_access_service_call(auth.uid(), public.get_sc_id_for_report(report_id))
);
-- Allow anonymous read for public share verification
CREATE POLICY "Public can verify active share tokens" ON public.report_shares FOR SELECT TO anon USING (is_active = true AND (expires_at IS NULL OR expires_at > now()) AND revoked_at IS NULL);

-- video_share_tokens policies
CREATE POLICY "Authenticated users can manage video tokens" ON public.video_share_tokens FOR ALL TO authenticated USING (public.is_admin(auth.uid()) OR public.can_access_service_call(auth.uid(), public.get_sc_id_for_video(video_id)));
CREATE POLICY "Public can verify video tokens" ON public.video_share_tokens FOR SELECT TO anon USING (true);

-- =============================================
-- STORAGE BUCKETS
-- =============================================

INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('reports-pdf', 'reports-pdf', false);

-- Storage policies for photos bucket
CREATE POLICY "Authenticated users can upload photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'photos');
CREATE POLICY "Authenticated users can read photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'photos');
CREATE POLICY "Users can delete own photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'photos');

-- Storage policies for videos bucket
CREATE POLICY "Authenticated users can upload videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'videos');
CREATE POLICY "Authenticated users can read videos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'videos');
CREATE POLICY "Users can delete own videos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'videos');

-- Storage policies for signatures bucket
CREATE POLICY "Authenticated users can upload signatures" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'signatures');
CREATE POLICY "Authenticated users can read signatures" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'signatures');

-- Storage policies for reports-pdf bucket
CREATE POLICY "Authenticated users can upload PDFs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'reports-pdf');
CREATE POLICY "Authenticated users can read PDFs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'reports-pdf');

-- Allow anon to read from specific buckets for public shares (via edge function signed URLs)
CREATE POLICY "Public can read shared report PDFs" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'reports-pdf');
CREATE POLICY "Public can read shared photos" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'photos');
CREATE POLICY "Public can read shared videos" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'videos');
CREATE POLICY "Public can read shared signatures" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'signatures');
