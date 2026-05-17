
-- Categories
CREATE TABLE public.inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage inventory_categories" ON public.inventory_categories
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Staff read inventory_categories" ON public.inventory_categories
  FOR SELECT USING (is_admin(auth.uid()) OR has_role(auth.uid(),'technician') OR has_role(auth.uid(),'secretary'));

-- Items
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES public.inventory_categories(id) ON DELETE SET NULL,
  image_path text,
  quantity_in_stock numeric NOT NULL DEFAULT 0,
  minimum_stock numeric NOT NULL DEFAULT 0,
  purchase_price numeric NOT NULL DEFAULT 0,
  recommended_sale_price numeric NOT NULL DEFAULT 0,
  notes text,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_items_category ON public.inventory_items(category_id);
CREATE INDEX idx_inventory_items_low_stock ON public.inventory_items(quantity_in_stock) WHERE is_archived = false;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage inventory_items" ON public.inventory_items
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Staff read inventory_items" ON public.inventory_items
  FOR SELECT USING (is_admin(auth.uid()) OR has_role(auth.uid(),'technician') OR has_role(auth.uid(),'secretary'));
CREATE POLICY "Staff update stock inventory_items" ON public.inventory_items
  FOR UPDATE USING (has_role(auth.uid(),'technician') OR has_role(auth.uid(),'secretary'));

CREATE TRIGGER trg_inventory_items_updated BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Service call materials
CREATE TABLE public.service_call_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_call_id uuid NOT NULL,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  image_path text,
  quantity numeric NOT NULL DEFAULT 1,
  purchase_price numeric NOT NULL DEFAULT 0,
  customer_price numeric NOT NULL DEFAULT 0,
  receipt_path text,
  is_one_off boolean NOT NULL DEFAULT false,
  added_to_inventory boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scm_call ON public.service_call_materials(service_call_id);
CREATE INDEX idx_scm_item ON public.service_call_materials(inventory_item_id);

ALTER TABLE public.service_call_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage scm" ON public.service_call_materials
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Staff read scm" ON public.service_call_materials
  FOR SELECT USING (can_access_service_call(auth.uid(), service_call_id));
CREATE POLICY "Staff insert scm" ON public.service_call_materials
  FOR INSERT WITH CHECK ((NOT has_role(auth.uid(),'contractor')) AND can_access_service_call(auth.uid(), service_call_id) AND created_by = auth.uid());
CREATE POLICY "Staff update scm" ON public.service_call_materials
  FOR UPDATE USING ((NOT has_role(auth.uid(),'contractor')) AND can_access_service_call(auth.uid(), service_call_id));
CREATE POLICY "Staff delete scm" ON public.service_call_materials
  FOR DELETE USING ((NOT has_role(auth.uid(),'contractor')) AND can_access_service_call(auth.uid(), service_call_id));

-- Inventory movements (audit + stats)
CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  service_call_id uuid,
  movement_type text NOT NULL, -- 'use' | 'restock' | 'adjustment' | 'add_from_oneoff'
  quantity numeric NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invmov_item ON public.inventory_movements(inventory_item_id);
CREATE INDEX idx_invmov_call ON public.inventory_movements(service_call_id);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage movements" ON public.inventory_movements
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Staff read movements" ON public.inventory_movements
  FOR SELECT USING (is_admin(auth.uid()) OR has_role(auth.uid(),'technician') OR has_role(auth.uid(),'secretary'));
CREATE POLICY "Staff insert movements" ON public.inventory_movements
  FOR INSERT WITH CHECK (has_role(auth.uid(),'technician') OR has_role(auth.uid(),'secretary'));

CREATE OR REPLACE FUNCTION public.validate_movement_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.movement_type NOT IN ('use','restock','adjustment','add_from_oneoff') THEN
    RAISE EXCEPTION 'Invalid movement_type: %', NEW.movement_type;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_validate_movement BEFORE INSERT OR UPDATE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.validate_movement_type();

-- Auto stock decrement when material from inventory is added to a service call
CREATE OR REPLACE FUNCTION public.handle_material_stock_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  delta numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.inventory_item_id IS NOT NULL THEN
      UPDATE public.inventory_items
        SET quantity_in_stock = quantity_in_stock - NEW.quantity
        WHERE id = NEW.inventory_item_id;
      INSERT INTO public.inventory_movements (inventory_item_id, service_call_id, movement_type, quantity, created_by)
        VALUES (NEW.inventory_item_id, NEW.service_call_id, 'use', NEW.quantity, COALESCE(NEW.created_by, auth.uid()));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.inventory_item_id IS NOT NULL AND OLD.inventory_item_id = NEW.inventory_item_id THEN
      delta := NEW.quantity - OLD.quantity;
      IF delta <> 0 THEN
        UPDATE public.inventory_items
          SET quantity_in_stock = quantity_in_stock - delta
          WHERE id = NEW.inventory_item_id;
        INSERT INTO public.inventory_movements (inventory_item_id, service_call_id, movement_type, quantity, created_by)
          VALUES (NEW.inventory_item_id, NEW.service_call_id, 'adjustment', delta, auth.uid());
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.inventory_item_id IS NOT NULL THEN
      UPDATE public.inventory_items
        SET quantity_in_stock = quantity_in_stock + OLD.quantity
        WHERE id = OLD.inventory_item_id;
      INSERT INTO public.inventory_movements (inventory_item_id, service_call_id, movement_type, quantity, created_by)
        VALUES (OLD.inventory_item_id, OLD.service_call_id, 'adjustment', OLD.quantity, auth.uid());
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER trg_material_stock_change
AFTER INSERT OR UPDATE OR DELETE ON public.service_call_materials
FOR EACH ROW EXECUTE FUNCTION public.handle_material_stock_change();

-- Storage bucket for inventory images
INSERT INTO storage.buckets (id, name, public) VALUES ('inventory', 'inventory', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Staff read inventory bucket" ON storage.objects
  FOR SELECT USING (bucket_id = 'inventory' AND (is_admin(auth.uid()) OR has_role(auth.uid(),'technician') OR has_role(auth.uid(),'secretary')));
CREATE POLICY "Staff upload inventory bucket" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'inventory' AND (is_admin(auth.uid()) OR has_role(auth.uid(),'technician') OR has_role(auth.uid(),'secretary')));
CREATE POLICY "Staff update inventory bucket" ON storage.objects
  FOR UPDATE USING (bucket_id = 'inventory' AND (is_admin(auth.uid()) OR has_role(auth.uid(),'technician') OR has_role(auth.uid(),'secretary')));
CREATE POLICY "Admins delete inventory bucket" ON storage.objects
  FOR DELETE USING (bucket_id = 'inventory' AND is_admin(auth.uid()));

-- Seed common plumbing categories
INSERT INTO public.inventory_categories (name, color, icon, sort_order) VALUES
  ('ברזים', '#3b82f6', 'Droplet', 1),
  ('צנרת', '#10b981', 'Pipette', 2),
  ('אביזרי אמבטיה', '#8b5cf6', 'ShowerHead', 3),
  ('מיכלי הדחה', '#f59e0b', 'Box', 4),
  ('כלי עבודה', '#ef4444', 'Wrench', 5),
  ('חומרי איטום', '#6366f1', 'Package', 6),
  ('אחר', '#64748b', 'Package', 99);
