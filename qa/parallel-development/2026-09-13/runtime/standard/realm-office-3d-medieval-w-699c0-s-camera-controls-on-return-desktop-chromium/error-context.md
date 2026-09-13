# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: realm-office-3d.spec.mjs >> medieval work bay opens the real archive and preserves camera controls on return
- Location: tests\e2e\realm-office-3d.spec.mjs:39:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: Test timeout of 90000ms exceeded
```

```
Tearing down "context" exceeded the test timeout of 90000ms.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e2]:
    - link "Bỏ qua điều hướng, tới nội dung Realm" [ref=e3] [cursor=pointer]:
      - /url: "#realm-main-content"
    - status [ref=e4]: Đã mở Đại sảnh.
    - generic [ref=e5]:
      - generic [ref=e6]:
        - img [ref=e8]
        - generic [ref=e10]:
          - strong [ref=e11]: CRMegoric Realms
          - generic [ref=e12]: Guildhall · Bản xem thử · Guildhall đang hoạt động
      - navigation "Chuyển không gian làm việc" [ref=e13]:
        - button "Guildhall" [pressed] [ref=e14] [cursor=pointer]:
          - img [ref=e15]
          - generic [ref=e17]: Guildhall
        - link "Mở workspace ERP CRM gốc" [ref=e18] [cursor=pointer]:
          - /url: /dashboard
          - img [ref=e19]
          - generic [ref=e21]: ERP · CRM
        - button "Chronicle" [ref=e22] [cursor=pointer]:
          - img [ref=e23]
          - generic [ref=e25]: Chronicle
      - generic [ref=e26]:
        - group "Language / Ngôn ngữ" [ref=e27]:
          - button "VI" [pressed] [ref=e28] [cursor=pointer]
          - button "EN" [ref=e29] [cursor=pointer]
        - combobox "Trạng thái hiện diện" [ref=e32]:
          - option "Sẵn sàng" [selected]
          - option "Đang bận"
          - option "Tập trung"
          - option "Không làm phiền"
        - button "Mở Chronicle, số dư 28 Gold" [ref=e33] [cursor=pointer]:
          - generic [ref=e34]: G
          - strong [ref=e35]: 28 Gold
        - button "Mở hồ sơ nhân vật" [ref=e36] [cursor=pointer]:
          - generic [ref=e37]: A0
    - generic [ref=e38]:
      - generic [ref=e39]:
        - generic "Văn phòng Realm 3D. WASD hoặc phím mũi tên để đi, kéo chuột để xoay góc nhìn, E để tương tác." [active] [ref=e40]
        - status [ref=e41]: Đã mở Thư viện
      - button "Đóng bàn làm việc" [ref=e42] [cursor=pointer]
      - complementary "Đại sảnh" [ref=e43]:
        - generic [ref=e44]:
          - generic [ref=e45]:
            - generic [ref=e46]: Bàn làm việc Guildhall
            - strong [ref=e47]: Đại sảnh
          - button "Đóng" [ref=e48] [cursor=pointer]:
            - img [ref=e49]
        - generic [ref=e51]:
          - generic [ref=e52]:
            - generic [ref=e53]: Daily briefing
            - heading "Chào mừng trở lại, Adventurer 06C8" [level=2] [ref=e54]
            - paragraph [ref=e55]: "Văn phòng là bản đồ sống của CRMegoric: người, công việc và cuộc trò chuyện cùng tồn tại trong một ngữ cảnh."
          - generic [ref=e56]:
            - generic [ref=e57]:
              - generic [ref=e58]: Vị trí
              - strong [ref=e59]: Hành lang lâu đài
            - generic [ref=e60]:
              - generic [ref=e61]: Trong tầm thoại
              - strong [ref=e62]: 0 đồng đội
            - generic [ref=e63]:
              - generic [ref=e64]: Quest sẵn sàng
              - strong [ref=e65]: 1 nhiệm vụ
            - generic [ref=e66]:
              - generic [ref=e67]: Nhân vật
              - strong [ref=e68]: Level 12 · 28 Gold
          - generic [ref=e69]:
            - img [ref=e70]
            - generic [ref=e72]:
              - strong [ref=e73]: Ưu tiên tiếp theo
              - paragraph [ref=e74]: Khóa sổ chiến dịch Rồng Xanh · Campaign Rồng Xanh
            - button "Đi tới" [ref=e75] [cursor=pointer]
          - generic [ref=e76]:
            - strong [ref=e77]: Cách di chuyển
            - paragraph [ref=e78]: Dùng WASD, phím mũi tên, cụm nút điều khiển hoặc nhấp vào vị trí trên bản đồ. Khi đứng gần object, nhấn E để mở.
  - alert [ref=e79]
```