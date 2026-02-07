
-- Tighten UPDATE/INSERT/DELETE policies to explicitly exclude contractors
-- These policies use can_access_service_call which already excludes contractors,
-- but we add explicit NOT has_role checks as defense-in-depth.

-- 1. quote_items: UPDATE
DROP POLICY IF EXISTS "Users can update quote_items for accessible calls" ON public.quote_items;
CREATE POLICY "Users can update quote_items for accessible calls" 
ON public.quote_items FOR UPDATE 
USING (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND can_access_service_call(auth.uid(), get_sc_id_for_quote(quote_id))
);

-- 2. quote_items: INSERT
DROP POLICY IF EXISTS "Users can insert quote_items for accessible calls" ON public.quote_items;
CREATE POLICY "Users can insert quote_items for accessible calls" 
ON public.quote_items FOR INSERT 
WITH CHECK (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND can_access_service_call(auth.uid(), get_sc_id_for_quote(quote_id))
);

-- 3. quote_items: DELETE
DROP POLICY IF EXISTS "Users can delete quote_items for accessible calls" ON public.quote_items;
CREATE POLICY "Users can delete quote_items for accessible calls" 
ON public.quote_items FOR DELETE 
USING (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND can_access_service_call(auth.uid(), get_sc_id_for_quote(quote_id))
);

-- 4. quotes: UPDATE
DROP POLICY IF EXISTS "Users can update quotes for accessible calls" ON public.quotes;
CREATE POLICY "Users can update quotes for accessible calls" 
ON public.quotes FOR UPDATE 
USING (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND can_access_service_call(auth.uid(), service_call_id)
);

-- 5. quotes: INSERT
DROP POLICY IF EXISTS "Users can insert quotes for accessible calls" ON public.quotes;
CREATE POLICY "Users can insert quotes for accessible calls" 
ON public.quotes FOR INSERT 
WITH CHECK (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND can_access_service_call(auth.uid(), service_call_id) 
  AND (created_by = auth.uid())
);

-- 6. quotes: DELETE (Users can delete own quotes)
DROP POLICY IF EXISTS "Users can delete own quotes" ON public.quotes;
CREATE POLICY "Users can delete own quotes" 
ON public.quotes FOR DELETE 
USING (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND ((created_by = auth.uid()) OR is_admin(auth.uid()))
);

-- 7. reports: UPDATE
DROP POLICY IF EXISTS "Users can update reports for accessible calls" ON public.reports;
CREATE POLICY "Users can update reports for accessible calls" 
ON public.reports FOR UPDATE 
USING (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND can_access_service_call(auth.uid(), service_call_id)
);

-- 8. reports: INSERT
DROP POLICY IF EXISTS "Users can insert reports for accessible calls" ON public.reports;
CREATE POLICY "Users can insert reports for accessible calls" 
ON public.reports FOR INSERT 
WITH CHECK (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND can_access_service_call(auth.uid(), service_call_id) 
  AND (created_by = auth.uid())
);

-- 9. service_call_photos: INSERT
DROP POLICY IF EXISTS "Users can insert photos for accessible calls" ON public.service_call_photos;
CREATE POLICY "Users can insert photos for accessible calls" 
ON public.service_call_photos FOR INSERT 
WITH CHECK (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND can_access_service_call(auth.uid(), service_call_id) 
  AND (uploaded_by = auth.uid())
);

-- 10. service_call_photos: DELETE
DROP POLICY IF EXISTS "Users can delete own photos" ON public.service_call_photos;
CREATE POLICY "Users can delete own photos" 
ON public.service_call_photos FOR DELETE 
USING (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND ((uploaded_by = auth.uid()) OR is_admin(auth.uid()))
);

-- 11. service_call_videos: INSERT
DROP POLICY IF EXISTS "Users can insert videos for accessible calls" ON public.service_call_videos;
CREATE POLICY "Users can insert videos for accessible calls" 
ON public.service_call_videos FOR INSERT 
WITH CHECK (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND can_access_service_call(auth.uid(), service_call_id) 
  AND (uploaded_by = auth.uid())
);

-- 12. service_call_videos: UPDATE
DROP POLICY IF EXISTS "Users can update videos for accessible calls" ON public.service_call_videos;
CREATE POLICY "Users can update videos for accessible calls" 
ON public.service_call_videos FOR UPDATE 
USING (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND can_access_service_call(auth.uid(), service_call_id)
);

-- 13. service_call_videos: DELETE
DROP POLICY IF EXISTS "Users can delete own videos" ON public.service_call_videos;
CREATE POLICY "Users can delete own videos" 
ON public.service_call_videos FOR DELETE 
USING (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND ((uploaded_by = auth.uid()) OR is_admin(auth.uid()))
);

-- 14. Technicians update - explicitly exclude contractors
DROP POLICY IF EXISTS "Technicians can update assigned service_calls" ON public.service_calls;
CREATE POLICY "Technicians can update assigned service_calls" 
ON public.service_calls FOR UPDATE 
USING (
  has_role(auth.uid(), 'technician'::app_role) 
  AND ((assigned_to = auth.uid()) OR (created_by = auth.uid()))
);

-- 15. service_call_shares: manage
DROP POLICY IF EXISTS "Users can manage shares for accessible calls" ON public.service_call_shares;
CREATE POLICY "Users can manage shares for accessible calls" 
ON public.service_call_shares FOR ALL
USING (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND can_access_service_call(auth.uid(), service_call_id)
);

-- 16. report_shares: manage
DROP POLICY IF EXISTS "Assigned users can manage shares" ON public.report_shares;
CREATE POLICY "Assigned users can manage shares" 
ON public.report_shares FOR ALL
USING (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND can_access_service_call(auth.uid(), get_sc_id_for_report(report_id))
);

-- 17. video_share_tokens: manage
DROP POLICY IF EXISTS "Authenticated users can manage video tokens" ON public.video_share_tokens;
CREATE POLICY "Authenticated users can manage video tokens" 
ON public.video_share_tokens FOR ALL
USING (
  NOT has_role(auth.uid(), 'contractor'::app_role)
  AND (is_admin(auth.uid()) OR can_access_service_call(auth.uid(), get_sc_id_for_video(video_id)))
);
