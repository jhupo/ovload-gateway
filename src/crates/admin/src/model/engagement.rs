//! Commands which move promotional funds or change content audit evidence.
use serde::Deserialize;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum EngagementCommand {
    Commerce {
        key: String,
        command: super::commerce::CommerceCommand,
    },
    SaveAnnouncement {
        id: Option<Uuid>,
        revision: Option<i64>,
        document: serde_json::Value,
    },
    DeleteAnnouncement {
        id: Uuid,
        revision: i64,
    },
    ReadAnnouncement {
        id: Uuid,
        revision: i64,
    },
    TransferReferral {
        key: String,
    },
    StartLottery {
        key: String,
        reward_cents: i64,
        winner_count: i32,
        participant_target: i32,
        minimum_recharge_cents: i64,
        human_verification: bool,
    },
    EndLottery {
        round_id: i64,
    },
    LotteryChallenge {
        round_id: i64,
    },
    JoinLottery {
        round_id: i64,
        challenge_id: Option<Uuid>,
        answer: Option<String>,
    },
    DeleteAudit {
        ids: Vec<Uuid>,
    },
}

/// Render the one-use challenge as pixels; the answer is never included in markup.
pub fn lottery_challenge_image(
    answer: &str,
    noise: &[u8; 16],
) -> super::identity_access::IdentityResult<String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use image::{ImageFormat, Rgb, RgbImage};
    if answer.len() != 6 {
        return Err(super::identity_access::IdentityError::Invalid);
    }
    const GLYPHS: [[u8; 7]; 16] = [
        [14, 17, 19, 21, 25, 17, 14],
        [4, 12, 4, 4, 4, 4, 14],
        [14, 17, 1, 2, 4, 8, 31],
        [30, 1, 1, 14, 1, 1, 30],
        [2, 6, 10, 18, 31, 2, 2],
        [31, 16, 16, 30, 1, 1, 30],
        [14, 16, 16, 30, 17, 17, 14],
        [31, 1, 2, 4, 8, 8, 8],
        [14, 17, 17, 14, 17, 17, 14],
        [14, 17, 17, 15, 1, 1, 14],
        [14, 17, 17, 31, 17, 17, 17],
        [30, 17, 17, 30, 17, 17, 30],
        [14, 17, 16, 16, 16, 17, 14],
        [30, 17, 17, 17, 17, 17, 30],
        [31, 16, 16, 30, 16, 16, 31],
        [31, 16, 16, 30, 16, 16, 16],
    ];
    let mut image = RgbImage::from_pixel(180, 55, Rgb([226, 232, 240]));
    for x in 0..180u32 {
        for y in 0..55u32 {
            if (x * 13 + y * 17 + u32::from(noise[(x as usize + y as usize) % 16])) % 29 == 0 {
                image.put_pixel(x, y, Rgb([100, 116, 139]));
            }
        }
    }
    for (i, character) in answer.chars().enumerate() {
        let glyph = character
            .to_digit(16)
            .ok_or(super::identity_access::IdentityError::Invalid)? as usize;
        for (row, &bits) in GLYPHS[glyph].iter().enumerate() {
            for column in 0..5 {
                if bits & (1 << (4 - column)) != 0 {
                    for dx in 0..3 {
                        for dy in 0..3 {
                            let x = 8
                                + i as u32 * 27
                                + column * 3
                                + dx
                                + (row as u32 + u32::from(noise[i])) % 3;
                            let y = 12 + u32::from(noise[i + 6]) % 9 + row as u32 * 3 + dy;
                            image.put_pixel(x, y, Rgb([15, 23, 42]));
                        }
                    }
                }
            }
        }
    }
    let mut bytes = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut bytes, ImageFormat::Png)
        .map_err(|_| super::identity_access::IdentityError::Unavailable)?;
    Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(bytes.into_inner())
    ))
}
