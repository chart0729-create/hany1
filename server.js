import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 정적 파일 (index.html, admin.html, detail.html 등)
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

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

// ========== 간단 파일 기반 매물 DB ==========
const LISTINGS_DB_PATH = path.join(__dirname, "listings.db.json");

function loadListingsFromFile() {
  try {
    const raw = fs.readFileSync(LISTINGS_DB_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // 파일이 없거나 파싱 오류일 때는 빈 배열
    return [];
  }
}

function saveListingsToFile(listings) {
  try {
    fs.writeFileSync(LISTINGS_DB_PATH, JSON.stringify(listings, null, 2), "utf-8");
  } catch (e) {
    console.error("매물 DB 저장 오류:", e);
  }
}

// ========== 매물 관련 API ==========

// 전체 매물 목록
app.get("/api/listings", (req, res) => {
  const list = loadListingsFromFile();
  return res.json({ ok: true, listings: list });
});

// 단일 매물 조회
app.get("/api/listings/:id", (req, res) => {
  const list = loadListingsFromFile();
  const id = req.params.id;
  const item = list.find((x) => String(x.id) === String(id));
  if (!item) {
    return res.status(404).json({ ok: false, error: "해당 매물을 찾을 수 없습니다." });
  }
  return res.json({ ok: true, listing: item });
});

// 매물 등록
app.post("/api/listings", (req, res) => {
  const { title, price, location, mapUrl, desc, tags, images } = req.body || {};
  if (!title) {
    return res.json({ ok: false, error: "제목은 필수입니다." });
  }

  const list = loadListingsFromFile();
  const nextId =
    list.length > 0 ? Math.max(...list.map((x) => Number(x.id) || 0)) + 1 : 1;

  const now = new Date().toISOString();

  const newItem = {
    id: nextId,
    title: String(title),
    price: price ? String(price) : "",
    location: location ? String(location) : "",
    mapUrl: mapUrl ? String(mapUrl) : "",
    desc: desc ? String(desc) : "",
    tags: Array.isArray(tags) ? tags : [],
    images: Array.isArray(images) ? images : [],
    createdAt: now,
    updatedAt: now,
  };

  list.push(newItem);
  saveListingsToFile(list);

  return res.json({ ok: true, listing: newItem, listings: list });
});

// 매물 삭제
app.delete("/api/listings/:id", (req, res) => {
  const list = loadListingsFromFile();
  const id = req.params.id;
  const remaining = list.filter((x) => String(x.id) !== String(id));
  if (remaining.length === list.length) {
    return res.status(404).json({ ok: false, error: "삭제할 매물을 찾을 수 없습니다." });
  }
  saveListingsToFile(remaining);
  return res.json({ ok: true, listings: remaining });
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

    const finalUrl = response.url;
    if (!finalUrl) {
      return res.status(200).json({ error: "최종 주소를 찾을 수 없습니다." });
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
