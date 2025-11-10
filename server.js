import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import pkg from "pg";
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 정적 파일 (index.html, admin.html, detail.html 등)
app.use(express.static(path.join(__dirname, "public")));

// JSON 바디 용량 제한 상향 (이미지 base64 등 큰 데이터용)
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// ========== Render Postgres 연결 (매물용) ==========
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        price TEXT,
        location TEXT,
        map_url TEXT,
        "desc" TEXT,
        tags JSONB DEFAULT '[]'::jsonb,
        images JSONB DEFAULT '[]'::jsonb,
        contract_done BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✅ Postgres listings 테이블 준비 완료");
  } catch (err) {
    console.error("❌ Postgres 초기화 오류:", err);
  }
}

initDb();

// ========== 간단 파일 기반 사용자 DB ==========
const USERS_DB_PATH = path.join(__dirname, "users.db.json");

function loadUsers() {
  try {
    const raw = fs.readFileSync(USERS_DB_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // 파일이 없거나 오류일 때
    return [];
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users, null, 2), "utf-8");
  } catch (e) {
    console.error("사용자 DB 저장 오류:", e);
  }
}

function ensureAdminUser() {
  const users = loadUsers();
  const hasAdmin = users.some(u => u.id === "admin");
  if (!hasAdmin) {
    users.push({
      id: "admin",
      nickname: "admin",
      phone: "",
      pw: "admin123",
      role: "admin"
    });
    saveUsers(users);
    console.log("기본 관리자 계정 생성: admin / admin123");
  }
}
ensureAdminUser();

// ========== 회원 관련 API ==========

// 회원가입
app.post("/api/signup", (req, res) => {
  const { nickname, phone, password } = req.body || {};
  if (!nickname || !password) {
    return res.json({ ok: false, error: "닉네임과 비밀번호는 필수입니다." });
  }

  const trimmedNickname = String(nickname).trim();
  const trimmedPhone = phone ? String(phone).trim() : "";

  if (!trimmedNickname) {
    return res.json({ ok: false, error: "닉네임을 올바르게 입력해주세요." });
  }
  if (trimmedNickname === "admin") {
    return res.json({ ok: false, error: "admin 닉네임은 사용할 수 없습니다." });
  }

  let users = loadUsers();
  if (users.some(u => u.id === trimmedNickname || u.nickname === trimmedNickname)) {
    return res.json({ ok: false, error: "이미 사용 중인 닉네임입니다." });
  }

  const newUser = {
    id: trimmedNickname,
    nickname: trimmedNickname,
    phone: trimmedPhone,
    pw: String(password),
    role: "user"
  };
  users.push(newUser);
  saveUsers(users);

  const safeUser = {
    id: newUser.id,
    nickname: newUser.nickname,
    phone: newUser.phone,
    role: newUser.role
  };

  return res.json({ ok: true, user: safeUser });
});

// 로그인
app.post("/api/login", (req, res) => {
  const { nickname, password } = req.body || {};
  if (!nickname || !password) {
    return res.json({ ok: false, error: "닉네임과 비밀번호를 입력해주세요." });
  }

  const trimmedNickname = String(nickname).trim();
  const pw = String(password);

  const users = loadUsers();
  const user = users.find(
    u => (u.id === trimmedNickname || u.nickname === trimmedNickname) && u.pw === pw
  );

  if (!user) {
    return res.json({ ok: false, error: "닉네임 또는 비밀번호가 올바르지 않습니다." });
  }

  const safeUser = {
    id: user.id,
    nickname: user.nickname,
    phone: user.phone,
    role: user.role
  };
  return res.json({ ok: true, user: safeUser });
});

// (옵션) 모든 사용자 목록 보기 - 비밀번호는 제외
app.get("/api/users", (req, res) => {
  const users = loadUsers();
  const safeUsers = users.map(u => ({
    id: u.id,
    nickname: u.nickname,
    phone: u.phone,
    role: u.role
  }));
  res.json({ ok: true, users: safeUsers });
});



// ========== 하단 문의 연락처 DB (전화/카톡/잘로/텔레) ==========
const CONTACT_DB_PATH = path.join(__dirname, "contact.db.json");

function loadContactInfo() {
  try {
    const raw = fs.readFileSync(CONTACT_DB_PATH, "utf-8");
    const j = JSON.parse(raw);
    return {
      name: typeof j.name === "string" ? j.name : "",
      phone: typeof j.phone === "string" ? j.phone : "",
      kakao: typeof j.kakao === "string" ? j.kakao : "",
      zalo: typeof j.zalo === "string" ? j.zalo : "",
      telegram: typeof j.telegram === "string" ? j.telegram : ""
    };
  } catch (e) {
    return { name: "", phone: "", kakao: "", zalo: "", telegram: "" };
  }
}

function saveContactInfo(info) {
  const safe = {
    name: typeof info.name === "string" ? info.name.trim() : "",
    phone: typeof info.phone === "string" ? info.phone.trim() : "",
    kakao: typeof info.kakao === "string" ? info.kakao.trim() : "",
    zalo: typeof info.zalo === "string" ? info.zalo.trim() : "",
    telegram: typeof info.telegram === "string" ? info.telegram.trim() : ""
  };
  try {
    fs.writeFileSync(CONTACT_DB_PATH, JSON.stringify(safe, null, 2), "utf-8");
  } catch (e) {
    console.error("연락처 저장 오류:", e);
  }
}

// 현재 연락처 조회
app.get("/api/contact-info", (req, res) => {
  return res.json({ ok: true, contact: loadContactInfo() });
});

// 연락처 저장 (관리자에서 설정)
app.post("/api/contact-info", (req, res) => {
  const { name, phone, kakao, zalo, telegram } = req.body || {};
  saveContactInfo({ name, phone, kakao, zalo, telegram });
  return res.json({ ok: true, contact: loadContactInfo() });
});

// ========== 매물 API (Postgres DB 사용) ==========

const LISTING_SELECT_SQL = `
  SELECT
    id,
    title,
    price,
    location,
    map_url AS "mapUrl",
    "desc" AS "desc",
    COALESCE(tags, '[]'::jsonb) AS tags,
    COALESCE(images, '[]'::jsonb) AS images,
    contract_done AS "contractDone",
    created_at AS "createdAt",
    updated_at AS "updatedAt"
  FROM listings
`;

// 전체 매물 조회
app.get("/api/listings", async (req, res) => {
  try {
    const { rows } = await pool.query(LISTING_SELECT_SQL + " ORDER BY id DESC");
    return res.json({ ok: true, listings: rows });
  } catch (e) {
    console.error("매물 목록 조회 오류:", e);
    return res
      .status(500)
      .json({ ok: false, error: "매물 목록을 불러오는 중 오류가 발생했습니다." });
  }
});

// 단일 매물 조회
app.get("/api/listings/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const { rows } = await pool.query(LISTING_SELECT_SQL + " WHERE id = $1", [id]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ ok: false, error: "해당 매물을 찾을 수 없습니다." });
    }
    return res.json({ ok: true, listing: rows[0] });
  } catch (e) {
    console.error("단일 매물 조회 오류:", e);
    return res
      .status(500)
      .json({ ok: false, error: "매물을 불러오는 중 오류가 발생했습니다." });
  }
});

// 매물 등록
app.post("/api/listings", async (req, res) => {
  const { title, price, location, mapUrl, desc, tags, images } = req.body || {};
  if (!title) {
    return res.json({ ok: false, error: "제목은 필수입니다." });
  }

  const now = new Date();
  const safeTags = Array.isArray(tags) ? tags : [];
  const safeImages = Array.isArray(images) ? images : [];

  try {
    const insertSql = `
      INSERT INTO listings
        (title, price, location, map_url, "desc", tags, images, contract_done, created_at, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)
      RETURNING
        id,
        title,
        price,
        location,
        map_url AS "mapUrl",
        "desc" AS "desc",
        tags,
        images,
        contract_done AS "contractDone",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;
    const { rows } = await pool.query(insertSql, [
      String(title),
      price ? String(price) : "",
      location ? String(location) : "",
      mapUrl ? String(mapUrl) : "",
      desc ? String(desc) : "",
      JSON.stringify(safeTags),
      JSON.stringify(safeImages),
      false,
      now,
      now,
    ]);
    const newItem = rows[0];

    const all = await pool.query(LISTING_SELECT_SQL + " ORDER BY id DESC");

    return res.json({ ok: true, listing: newItem, listings: all.rows });
  } catch (e) {
    console.error("매물 등록 오류:", e);
    return res
      .status(500)
      .json({ ok: false, error: "매물을 저장하는 중 오류가 발생했습니다." });
  }
});


// 매물 수정
app.put("/api/listings/:id", async (req, res) => {
  const id = req.params.id;
  const { title, price, location, mapUrl, desc, tags, images } = req.body || {};
  if (!title) {
    return res.json({ ok: false, error: "제목은 필수입니다." });
  }

  const now = new Date();
  const safeTags = Array.isArray(tags) ? tags : [];
  const safeImages = Array.isArray(images) ? images : [];

  try {
    const updateSql = `
      UPDATE listings
      SET
        title = $1,
        price = $2,
        location = $3,
        map_url = $4,
        "desc" = $5,
        tags = $6::jsonb,
        images = $7::jsonb,
        updated_at = $8
      WHERE id = $9
      RETURNING
        id,
        title,
        price,
        location,
        map_url AS "mapUrl",
        "desc" AS "desc",
        tags,
        images,
        contract_done AS "contractDone",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;
    const { rows } = await pool.query(updateSql, [
      String(title),
      price ? String(price) : "",
      location ? String(location) : "",
      mapUrl ? String(mapUrl) : "",
      desc ? String(desc) : "",
      JSON.stringify(safeTags),
      JSON.stringify(safeImages),
      now,
      id,
    ]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ ok: false, error: "수정할 매물을 찾을 수 없습니다." });
    }

    const all = await pool.query(LISTING_SELECT_SQL + " ORDER BY id DESC");
    return res.json({ ok: true, listing: rows[0], listings: all.rows });
  } catch (e) {
    console.error("매물 수정 오류:", e);
    return res
      .status(500)
      .json({ ok: false, error: "매물을 수정하는 중 오류가 발생했습니다." });
  }
});

// 매물 삭제
app.delete("/api/listings/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query("DELETE FROM listings WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ ok: false, error: "삭제할 매물을 찾을 수 없습니다." });
    }

    const { rows } = await pool.query(LISTING_SELECT_SQL + " ORDER BY id DESC");
    return res.json({ ok: true, listings: rows });
  } catch (e) {
    console.error("매물 삭제 오류:", e);
    return res
      .status(500)
      .json({ ok: false, error: "매물을 삭제하는 중 오류가 발생했습니다." });
  }
});

// 매물 계약 상태 변경
app.post("/api/listings/:id/contract", async (req, res) => {
  const id = req.params.id;
  const done = !!(req.body && req.body.done);

  try {
    const updateSql = `
      UPDATE listings
      SET contract_done = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        title,
        price,
        location,
        map_url AS "mapUrl",
        "desc" AS "desc",
        tags,
        images,
        contract_done AS "contractDone",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;
    const { rows } = await pool.query(updateSql, [done, id]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ ok: false, error: "계약 상태를 변경할 매물을 찾을 수 없습니다." });
    }

    const all = await pool.query(LISTING_SELECT_SQL + " ORDER BY id DESC");
    return res.json({ ok: true, listing: rows[0], listings: all.rows });
  } catch (e) {
    console.error("계약 상태 변경 오류:", e);
    return res
      .status(500)
      .json({ ok: false, error: "계약 상태를 저장하는 중 오류가 발생했습니다." });
  }
});


// ========== 짧은 구글맵 URL → 최종 긴 URL로 변환 ==========
app.get("/api/resolve-map", async (req, res) => {
  const shortUrl = req.query.url;
  if (!shortUrl) {
    return res.status(400).json({ error: "url 파라미터가 필요합니다." });
  }

  try {
    const response = await fetch(shortUrl, {
      method: "GET",
      redirect: "follow",
    });

    let finalUrl = response.url || "";
    if (!finalUrl) {
      return res.status(200).json({ error: "최종 주소를 찾을 수 없습니다." });
    }

    // 🔹 여기 추가: 퍼센트 인코딩 풀기
    try {
      finalUrl = decodeURIComponent(finalUrl);
    } catch (e) {
      // 디코딩 실패하면 그냥 원본 사용
    }

    return res.json({ fullUrl: finalUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "주소 변환 중 오류가 발생했습니다." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Hany 부동산 서버가 http://localhost:${PORT} 에서 실행 중`);
});
