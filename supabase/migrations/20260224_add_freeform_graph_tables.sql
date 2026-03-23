-- Migration to add Freeform Graph isolated tables.
-- These tables are strictly used only when canvas layout === 'freeform'
-- to ensure no ghosting or interference with the existing canvas line architecture.

-- 1. Freeform Graph Edges
CREATE TABLE IF NOT EXISTS freeform_graph_edges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  source_post_id uuid NOT NULL REFERENCES padlets(id) ON DELETE CASCADE,
  target_post_id uuid NOT NULL REFERENCES padlets(id) ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (relation_type IN ('solid', 'dashed', 'dotted')) DEFAULT 'solid',
  direction text NOT NULL CHECK (direction IN ('none', 'forward', 'backward', 'bidirectional')) DEFAULT 'forward',
  label text,
  style jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast traversal of neighborhood per board
CREATE INDEX IF NOT EXISTS idx_freeform_edges_board 
  ON freeform_graph_edges(board_id);
CREATE INDEX IF NOT EXISTS idx_freeform_edges_source 
  ON freeform_graph_edges(source_post_id);
CREATE INDEX IF NOT EXISTS idx_freeform_edges_target 
  ON freeform_graph_edges(target_post_id);

-- 2. Freeform Graph Settings
CREATE TABLE IF NOT EXISTS freeform_graph_settings (
  board_id uuid PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
  layout_mode text NOT NULL CHECK (layout_mode IN ('manual', 'auto')) DEFAULT 'manual',
  focus_node_id uuid REFERENCES padlets(id) ON DELETE SET NULL,
  show_minimap boolean NOT NULL DEFAULT true,
  snap_strength integer NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Triggers for updated_at
CREATE OR REPLACE FUNCTION update_freeform_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_freeform_edges_update ON freeform_graph_edges;
CREATE TRIGGER trigger_freeform_edges_update
  BEFORE UPDATE ON freeform_graph_edges
  FOR EACH ROW
  EXECUTE FUNCTION update_freeform_updated_at();

DROP TRIGGER IF EXISTS trigger_freeform_settings_update ON freeform_graph_settings;
CREATE TRIGGER trigger_freeform_settings_update
  BEFORE UPDATE ON freeform_graph_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_freeform_updated_at();

-- 4. RLS Policies
ALTER TABLE freeform_graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE freeform_graph_settings ENABLE ROW LEVEL SECURITY;

-- Note: We assume board access implies access here (using standard board member patterns).
-- For isolation and compatibility, we gate by board ownership (boards.user_id = auth.uid()).

CREATE POLICY "Users can select freeform edges of their boards" 
  ON freeform_graph_edges FOR SELECT 
  USING (EXISTS (SELECT 1 FROM boards b WHERE b.id = freeform_graph_edges.board_id AND b.user_id = auth.uid()));

CREATE POLICY "Users can insert freeform edges of their boards" 
  ON freeform_graph_edges FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM boards b WHERE b.id = freeform_graph_edges.board_id AND b.user_id = auth.uid()));

CREATE POLICY "Users can update freeform edges of their boards" 
  ON freeform_graph_edges FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM boards b WHERE b.id = freeform_graph_edges.board_id AND b.user_id = auth.uid()));

CREATE POLICY "Users can delete freeform edges of their boards" 
  ON freeform_graph_edges FOR DELETE 
  USING (EXISTS (SELECT 1 FROM boards b WHERE b.id = freeform_graph_edges.board_id AND b.user_id = auth.uid()));

-- Settings policies
CREATE POLICY "Users can select freeform settings of their boards" 
  ON freeform_graph_settings FOR SELECT 
  USING (EXISTS (SELECT 1 FROM boards b WHERE b.id = freeform_graph_settings.board_id AND b.user_id = auth.uid()));

CREATE POLICY "Users can insert freeform settings of their boards" 
  ON freeform_graph_settings FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM boards b WHERE b.id = freeform_graph_settings.board_id AND b.user_id = auth.uid()));

CREATE POLICY "Users can update freeform settings of their boards" 
  ON freeform_graph_settings FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM boards b WHERE b.id = freeform_graph_settings.board_id AND b.user_id = auth.uid()));
