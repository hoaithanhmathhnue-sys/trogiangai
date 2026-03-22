export interface ProUser {
  username: string;
  password: string;
  name: string;
}

export const PRO_USERS: ProUser[] = [
  { username: "duonghangdtntls@gmail.com", password: "SKKN100", name: "GV" },
  { username: "phongc3vvk@gmail.com", password: "SKKN100", name: "GV" },
  { username: "phantamk52dhsplichsu@gmail.com", password: "SKKN100", name: "GV" },
  { username: "phamminhkhai2004@gmail.com", password: "SKKN100", name: "GV" },
  { username: "vohoaitam87@gmail.com", password: "SKKN100", name: "GV" },
  { username: "thuyduyen205@gmail.com", password: "SKKN100", name: "GV" },
  { username: "Masavu97@gmail.com", password: "SKKN100", name: "GV" },
  { username: "thuynt.thptdg@gmail.com", password: "KHBG100", name: "GV" },
  { username: "vucamly712003@gmail.com", password: "KHBG100", name: "GV" },
  { username: "thuyduyen205@gmail.com", password: "SKKN100", name: "GV" },
  { username: "Dothihuonglanqwe@gmail.com", password: "SKKN100", name: "GV" },
  { username: "VIPKIMCUONG", password: "123456", name: "GV" },
  { username: "THT", password: "admin123", name: "GV" },
];

export const validateProUser = (username: string, password: string): ProUser | null => {
  const user = PRO_USERS.find(
    u => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password.trim()
  );
  return user || null;
};
