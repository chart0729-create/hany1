// server.js
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// JSON 본문 파싱
app.use(express.json());

// ✅ 여기만 수정: 정적 파일 폴더를 프로젝트 루트가 아니라 public 으로
app.use(express.static(path.join(__dirname, "public")));

// ===== 간단 파일 DB 경로 =====
const DB_PATH = path.join(__dirname, "listings.json");
const USERS_DB_PATH = path.join(__dirname, "users.json");

// ===== 공통 유틸: 파일 DB 로드/저장 =====
function loadListings() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(DB_PATH, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("loadListings error", e);
    return [];
  }
}

function saveListings(list) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(list, null, 2), "utf8");
  } catch (e) {
    console.error("saveListings error", e);
  }
}

// ===== 유저 DB 유틸 =====
function loadUsers() {
  try {
    if (!fs.existsSync(USERS_DB_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(USERS_DB_PATH, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("loadUsers error", e);
    return [];
  }
}

function saveUsers(list) {
  try {
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify(list, null, 2), "utf8");
  } catch (e) {
    console.error("saveUsers error", e);
  }
}

// ===== 매물 관련 API =====

// 전체 매물 조회
app.get("/api/listings", (req, res) => {
  const data = loadListings();
  return res.json({ ok: true, listings: data });
});

// 단일 매물 조회
app.get("/api/listings/:id", (req, res) => {
  const id = String(req.params.id);
  const data = loadListings();
  const found = data.find((x) => String(x.id) === id);
  if (!found) {
    return res.json({ ok: false, error: "해당 매물을 찾을 수 없습니다." });
  }
  return res.json({ ok: true, listing: found });
});

// 매물 저장(신규/수정)
app.post("/api/listings", (req, res) => {
  try {
    const body = req.body || {};
    const data = loadListings();

    let nextId = 1;
    if (data.length > 0) {
      const maxId = data.reduce((acc, cur) => {
        const n = Number(cur.id) || 0;
        return n > acc ? n : acc;
      }, 0);
      nextId = maxId + 1;
    }

    let target;
    if (body.id) {
      target = data.find((x) => String(x.id) === String(body.id));
    }

    if (!target) {
      target = {
        id: nextId,
        title: "",
        price: "",
        location: "",
        desc: "",
        tags: [],
        images: [],
        mapUrl: "",
        lat: null,
        lng: null,
        completed: false,
      };
      data.push(target);
    }

    if (typeof body.title === "string") target.title = body.title;
    if (typeof body.price === "string") target.price = body.price;
    if (typeof body.location === "string") target.location = body.location;
    if (typeof body.desc === "string") target.desc = body.desc;
    if (typeof body.mapUrl === "string") target.mapUrl = body.mapUrl;
    if (body.lat != null) target.lat = body.lat;
    if (body.lng != null) target.lng = body.lng;

    if (Array.isArray(body.tags)) {
      target.tags = body.tags;
    }
    if (Array.isArray(body.images)) {
      target.images = body.images;
    }

    saveListings(data);
    return res.json({ ok: true, listing: target });
  } catch (e) {
    console.error("POST /api/listings error", e);
    return res.status(500).json({
      ok: false,
      error: "매물 저장 중 오류가 발생했습니다.",
    });
  }
});

// 매물 삭제
app.delete("/api/listings/:id", (req, res) => {
  const id = String(req.params.id);
  const data = loadListings();
  const beforeLen = data.length;
  const filtered = data.filter((x) => String(x.id) !== id);
  if (beforeLen === filtered.length) {
    return res.json({ ok: false, error: "삭제할 매물을 찾을 수 없습니다." });
  }
  saveListings(filtered);
  return res.json({ ok: true });
});

// 계약완료 / 해제
app.patch("/api/listings/:id/complete", (req, res) => {
  const id = String(req.params.id);
  const { completed } = req.body || {};
  const data = loadListings();
  const target = data.find((x) => String(x.id) === id);
  if (!target) {
    return res.json({ ok: false, error: "해당 매물을 찾을 수 없습니다." });
  }
  target.completed = !!completed;
  saveListings(data);
  return res.json({ ok: true, listing: target });
});

// 전체 리스트를 서버 파일에 동기화(덮어쓰기)하는 API
// (관리자 페이지에서 localStorage에 저장된 매물들을 서버 DB와 맞추기 위해 사용)
app.post("/api/listings/sync", (req, res) => {
  try {
    const body = req.body || {};
    const incoming = Array.isArray(body.listings) ? body.listings : [];
    const clean = incoming
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        return {
          id: item.id,
          title: item.title || "",
          price: item.price || "",
          location: item.location || "",
          desc: item.desc || "",
          tags: Array.isArray(item.tags) ? item.tags : [],
          imgs: Array.isArray(item.imgs) ? item.imgs : item.images || [],
          images: Array.isArray(item.images) ? item.images : item.imgs || [],
          mapUrl: item.mapUrl || "",
          lat: item.lat,
          lng: item.lng,
          completed: !!item.completed,
        };
      })
      .filter(Boolean);

    saveListings(clean);
    return res.json({ ok: true, count: clean.length });
  } catch (e) {
    console.error("매물 동기화 중 오류", e);
    return res.status(500).json({
      ok: false,
      error: "매물 동기화 중 오류가 발생했습니다.",
    });
  }
});

// ===== 회원 API =====

// 회원 가입
app.post("/api/signup", (req, res) => {
  try {
    const body = req.body || {};
    const nickname = (body.nickname || "").trim();
    const phone = (body.phone || "").trim();
    const password = (body.password || "").trim();

    if (!nickname || !phone || !password) {
      return res.json({
        ok: false,
        error: "닉네임, 전화번호, 비밀번호를 모두 입력해주세요.",
      });
    }

    const users = loadUsers();
    const exists = users.find(
      (u) => u.nickname === nickname || u.phone === phone
    );
    if (exists) {
      return res.json({
        ok: false,
        error: "이미 등록된 닉네임 또는 전화번호입니다.",
      });
    }

    const user = {
      id: Date.now(),
      nickname,
      phone,
      password,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);

    return res.json({ ok: true, user });
  } catch (e) {
    console.error("/api/signup error", e);
    return res.status(500).json({
      ok: false,
      error: "회원가입 중 오류가 발생했습니다.",
    });
  }
});

// 로그인
app.post("/api/login", (req, res) => {
  try {
    const body = req.body || {};
    const nickname = (body.nickname || "").trim();
    const password = (body.password || "").trim();

    if (!nickname || !password) {
      return res.json({
        ok: false,
        error: "닉네임과 비밀번호를 모두 입력해주세요.",
      });
    }

    const users = loadUsers();
    const found = users.find(
      (u) => u.nickname === nickname && u.password === password
    );
    if (!found) {
      return res.json({ ok: false, error: "회원 정보가 일치하지 않습니다." });
    }

    return res.json({
      ok: true,
      user: {
        id: found.id,
        nickname: found.nickname,
        phone: found.phone,
      },
    });
  } catch (e) {
    console.error("/api/login error", e);
    return res.status(500).json({
      ok: false,
      error: "로그인 중 오류가 발생했습니다.",
    });
  }
});

// 회원 목록 조회
app.get("/api/users", (req, res) => {
  try {
    const users = loadUsers();
    return res.json({
      ok: true,
      users: users.map((u) => ({
        id: u.id,
        nickname: u.nickname,
        phone: u.phone,
        createdAt: u.createdAt,
      })),
    });
  } catch (e) {
    console.error("/api/users error", e);
    return res.status(500).json({
      ok: false,
      error: "회원 목록 조회 중 오류가 발생했습니다.",
    });
  }
});

// ========== 서버 시작 ==========
app.listen(PORT, () => {
  console.log(`✅ Hany 부동산 서버가 http://localhost:${PORT} 에서 실행 중`);
});
