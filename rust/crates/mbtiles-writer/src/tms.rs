//! XYZ ⇄ TMS row conversion.
//!
//! MBTiles stores rows in TMS convention (row 0 is the *southern*-most row),
//! while every other component of the exporter works in XYZ (row 0 at the
//! north). This is the only module allowed to perform the flip, so a tile can
//! never be flipped twice or not at all.

/// Convert an XYZ row to a TMS row at zoom `z`.
#[inline]
pub fn xyz_to_tms_row(z: u8, y: u32) -> u32 {
    let n = 1u64 << z;
    (n - 1 - y as u64) as u32
}

/// Convert a TMS row back to an XYZ row. The flip is an involution, so this is
/// the same arithmetic; it exists for readability at call sites that read.
#[inline]
pub fn tms_to_xyz_row(z: u8, tms_y: u32) -> u32 {
    xyz_to_tms_row(z, tms_y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_tile_is_unchanged() {
        assert_eq!(xyz_to_tms_row(0, 0), 0);
    }

    #[test]
    fn flips_rows() {
        assert_eq!(xyz_to_tms_row(1, 0), 1);
        assert_eq!(xyz_to_tms_row(1, 1), 0);
        assert_eq!(xyz_to_tms_row(14, 5974), 16384 - 1 - 5974);
    }

    #[test]
    fn is_involution() {
        for z in 0..20u8 {
            let n = 1u32 << z;
            for y in [0, n / 2, n - 1] {
                assert_eq!(tms_to_xyz_row(z, xyz_to_tms_row(z, y)), y);
            }
        }
    }
}
