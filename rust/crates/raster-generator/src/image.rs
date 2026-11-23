//! RGBA buffers, 2× box downscale, selection clipping and PNG encoding.

use std::io::Cursor;

use generator_core::GeneratorError;
use tile_selector::mercator::tiles_per_axis;
use tile_selector::{Relation, SelectionArea, TileCoord};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RgbaImage {
    pub width: u32,
    pub height: u32,
    /// Row-major RGBA8, `width * height * 4` bytes.
    pub data: Vec<u8>,
}

impl RgbaImage {
    pub fn new(width: u32, height: u32, data: Vec<u8>) -> Result<Self, GeneratorError> {
        let expected = width as usize * height as usize * 4;
        if data.len() != expected {
            return Err(GeneratorError::Render(format!(
                "renderer returned {} bytes for a {width}x{height} tile (expected {expected})",
                data.len()
            )));
        }
        Ok(Self { width, height, data })
    }

    pub fn solid(width: u32, height: u32, rgba: [u8; 4]) -> Self {
        let mut data = Vec::with_capacity(width as usize * height as usize * 4);
        for _ in 0..(width * height) {
            data.extend_from_slice(&rgba);
        }
        Self { width, height, data }
    }

    /// Downscale by an integer factor using a box filter (average of the
    /// covered block). Used for z0 tiles rendered at 512px and delivered at 256px.
    pub fn downscale_to(&self, target: u32) -> Result<RgbaImage, GeneratorError> {
        if target == self.width && target == self.height {
            return Ok(self.clone());
        }
        if target == 0 || self.width % target != 0 || self.height % target != 0 || self.width != self.height {
            return Err(GeneratorError::Render(format!(
                "cannot downscale {}x{} to {target}x{target}",
                self.width, self.height
            )));
        }
        let factor = (self.width / target) as usize;
        let samples = (factor * factor) as u32;
        let src_w = self.width as usize;
        let mut out = vec![0u8; target as usize * target as usize * 4];
        for ty in 0..target as usize {
            for tx in 0..target as usize {
                let mut acc = [0u32; 4];
                for dy in 0..factor {
                    let row = (ty * factor + dy) * src_w;
                    for dx in 0..factor {
                        let i = (row + tx * factor + dx) * 4;
                        acc[0] += self.data[i] as u32;
                        acc[1] += self.data[i + 1] as u32;
                        acc[2] += self.data[i + 2] as u32;
                        acc[3] += self.data[i + 3] as u32;
                    }
                }
                let o = (ty * target as usize + tx) * 4;
                for c in 0..4 {
                    out[o + c] = ((acc[c] + samples / 2) / samples) as u8;
                }
            }
        }
        Ok(RgbaImage { width: target, height: target, data: out })
    }

    /// Zero alpha for every pixel whose center falls outside `area`.
    ///
    /// Fully contained tiles are left untouched. Only Partial (and theoretically
    /// Disjoint) tiles pay the per-pixel cost — which is tiny next to MapLibre
    /// render time.
    pub fn clip_to_selection(&mut self, tile: TileCoord, area: &SelectionArea) {
        match area.classify(&tile.norm_bounds()) {
            Relation::Contained => return,
            Relation::Disjoint => {
                for px in self.data.chunks_exact_mut(4) {
                    px[3] = 0;
                }
                return;
            }
            Relation::Partial => {}
        }

        let n = tiles_per_axis(tile.z) as f64;
        let w = self.width as f64;
        let h = self.height as f64;
        let origin_x = tile.x as f64;
        let origin_y = tile.y as f64;
        let width = self.width as usize;

        for py in 0..self.height as usize {
            let ny = (origin_y + (py as f64 + 0.5) / h) / n;
            for px in 0..width {
                let nx = (origin_x + (px as f64 + 0.5) / w) / n;
                if !area.contains_norm(nx, ny) {
                    self.data[(py * width + px) * 4 + 3] = 0;
                }
            }
        }
    }

    /// Encode as PNG (RGBA8). Uses fast compression: tiles are small and the
    /// CPU budget is better spent rendering.
    pub fn encode_png(&self) -> Result<Vec<u8>, GeneratorError> {
        let mut buf = Vec::with_capacity(self.data.len() / 4);
        {
            let mut enc = png::Encoder::new(Cursor::new(&mut buf), self.width, self.height);
            enc.set_color(png::ColorType::Rgba);
            enc.set_depth(png::BitDepth::Eight);
            enc.set_compression(png::Compression::Fast);
            enc.set_filter(png::Filter::Sub);
            let mut w = enc.write_header().map_err(|e| GeneratorError::Render(format!("png header: {e}")))?;
            w.write_image_data(&self.data).map_err(|e| GeneratorError::Render(format!("png data: {e}")))?;
            w.finish().map_err(|e| GeneratorError::Render(format!("png finish: {e}")))?;
        }
        Ok(buf)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_wrong_byte_count() {
        assert!(RgbaImage::new(2, 2, vec![0; 15]).is_err());
        assert!(RgbaImage::new(2, 2, vec![0; 16]).is_ok());
    }

    #[test]
    fn downscale_averages_blocks() {
        // 2x2 → 1x1 with pixels 0, 100, 200, 255 → mean 139 (rounded)
        let mut data = Vec::new();
        for v in [0u8, 100, 200, 255] {
            data.extend_from_slice(&[v, v, v, 255]);
        }
        let img = RgbaImage::new(2, 2, data).unwrap();
        let small = img.downscale_to(1).unwrap();
        assert_eq!(small.data, vec![139, 139, 139, 255]);
        let big = RgbaImage::solid(512, 512, [10, 20, 30, 255]);
        let d = big.downscale_to(256).unwrap();
        assert_eq!(d.width, 256);
        assert_eq!(&d.data[..4], &[10, 20, 30, 255]);
        assert!(big.downscale_to(100).is_err());
    }

    #[test]
    fn png_roundtrip() {
        let img = RgbaImage::solid(4, 4, [255, 0, 0, 128]);
        let bytes = img.encode_png().unwrap();
        assert_eq!(&bytes[..8], &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]);
        let decoder = png::Decoder::new(Cursor::new(&bytes));
        let mut reader = decoder.read_info().unwrap();
        let mut out = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut out).unwrap();
        assert_eq!((info.width, info.height), (4, 4));
        assert_eq!(&out[..4], &[255, 0, 0, 128]);
    }

    #[test]
    fn clip_leaves_contained_tile_opaque() {
        // z0 world tile fully contains a small Monaco-sized selection? No — world
        // is Partial. Use a tiny bbox that sits entirely inside tile 2/1/1.
        let tile = TileCoord::new(2, 1, 1);
        let [w, s, e, n] = tile.lon_lat_bounds();
        // shrink to the middle 50% so the tile is Contained relative to a larger area
        let area = SelectionArea::from_bbox(w - 40.0, s - 40.0, e + 40.0, n + 40.0).unwrap();
        assert_eq!(area.classify(&tile.norm_bounds()), Relation::Contained);
        let mut img = RgbaImage::solid(8, 8, [10, 20, 30, 255]);
        img.clip_to_selection(tile, &area);
        assert!(img.data.chunks_exact(4).all(|p| p[3] == 255));
    }

    #[test]
    fn clip_zeros_alpha_outside_partial_tile() {
        // Selection covers only the western half of tile 1/0/0 (NW quadrant at z1).
        let tile = TileCoord::new(1, 0, 0);
        let [w, s, e, n] = tile.lon_lat_bounds();
        let mid = (w + e) / 2.0;
        let area = SelectionArea::from_bbox(w, s, mid, n).unwrap();
        assert_eq!(area.classify(&tile.norm_bounds()), Relation::Partial);

        let mut img = RgbaImage::solid(4, 4, [1, 2, 3, 255]);
        img.clip_to_selection(tile, &area);

        // Left half opaque, right half transparent (pixel centers).
        for py in 0..4 {
            for px in 0..4 {
                let a = img.data[(py * 4 + px) * 4 + 3];
                if px < 2 {
                    assert_eq!(a, 255, "pixel ({px},{py}) should stay opaque");
                } else {
                    assert_eq!(a, 0, "pixel ({px},{py}) should be transparent");
                }
            }
        }
    }

    #[test]
    fn clip_matches_contains_norm_including_holes() {
        use serde_json::json;
        let tile = TileCoord::new(1, 0, 0);
        let [w, s, e, n] = tile.lon_lat_bounds();
        let hx0 = w + (e - w) * 0.25;
        let hx1 = w + (e - w) * 0.75;
        let hy0 = s + (n - s) * 0.25;
        let hy1 = s + (n - s) * 0.75;
        let poly = json!({
            "type": "Polygon",
            "coordinates": [
                [[w, s], [e, s], [e, n], [w, n], [w, s]],
                [[hx0, hy0], [hx1, hy0], [hx1, hy1], [hx0, hy1], [hx0, hy0]]
            ]
        });
        let area = SelectionArea::from_geojson_value(&poly).unwrap();
        assert_eq!(area.classify(&tile.norm_bounds()), Relation::Partial);

        let size = 8u32;
        let mut img = RgbaImage::solid(size, size, [9, 9, 9, 255]);
        img.clip_to_selection(tile, &area);

        let n_axis = tiles_per_axis(tile.z) as f64;
        let mut saw_opaque = false;
        let mut saw_clear = false;
        for py in 0..size as usize {
            for px in 0..size as usize {
                let nx = (tile.x as f64 + (px as f64 + 0.5) / size as f64) / n_axis;
                let ny = (tile.y as f64 + (py as f64 + 0.5) / size as f64) / n_axis;
                let a = img.data[(py * size as usize + px) * 4 + 3];
                let expected = if area.contains_norm(nx, ny) { 255 } else { 0 };
                assert_eq!(a, expected, "pixel ({px},{py})");
                saw_opaque |= a == 255;
                saw_clear |= a == 0;
            }
        }
        assert!(saw_opaque && saw_clear);
    }
}
