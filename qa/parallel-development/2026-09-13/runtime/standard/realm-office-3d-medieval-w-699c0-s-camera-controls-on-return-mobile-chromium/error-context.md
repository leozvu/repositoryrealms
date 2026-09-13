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
Tearing down "context" exceeded the test timeout of 90000ms.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - link "Bỏ qua điều hướng, tới nội dung Realm" [ref=e3] [cursor=pointer]:
      - /url: "#realm-main-content"
    - status [ref=e4]: Đã mở Đại sảnh.
    - generic [ref=e5]:
      - img [ref=e8]
      - navigation "Chuyển không gian làm việc" [ref=e10]:
        - button "Guildhall" [pressed] [ref=e11] [cursor=pointer]:
          - img [ref=e12]
        - link "Mở workspace ERP CRM gốc" [ref=e14] [cursor=pointer]:
          - /url: /dashboard
          - img [ref=e15]
        - button "Chronicle" [ref=e17] [cursor=pointer]:
          - img [ref=e18]
      - generic [ref=e20]:
        - group "Language / Ngôn ngữ" [ref=e21]:
          - button "VI" [pressed] [ref=e22] [cursor=pointer]
          - button "EN" [ref=e23] [cursor=pointer]
        - button "Mở hồ sơ nhân vật" [ref=e24] [cursor=pointer]:
          - generic [ref=e25]: AF
    - generic [ref=e26]:
      - generic [ref=e27]:
        - generic "Văn phòng Realm 3D. WASD hoặc phím mũi tên để đi, kéo chuột để xoay góc nhìn, E để tương tác." [ref=e28]
        - generic:
          - generic:
            - heading "Guildhall" [level=2]
            - generic: Dữ liệu mẫu
          - generic:
            - img
            - generic: Thư viện
          - paragraph: Góc nhìn theo nhân vật
        - navigation "Góc nhìn văn phòng" [ref=e29]:
          - button "Chọn địa điểm" [ref=e30] [cursor=pointer]:
            - img [ref=e31]
          - button "Đổi góc nhìn nhân vật" [ref=e34] [cursor=pointer]:
            - img [ref=e35]
          - button "Xem toàn cảnh" [ref=e38] [cursor=pointer]:
            - img [ref=e39]
          - button "Cài đặt đồ họa" [ref=e42] [cursor=pointer]:
            - img [ref=e43]
        - generic:
          - generic:
            - generic: Thư viện
        - generic "Đồng đội trong văn phòng"
        - generic [ref=e47]:
          - strong [ref=e49]: Thư viện
          - button "Mở Thư viện" [ref=e50] [cursor=pointer]:
            - text: Mở
            - img [ref=e51]
        - generic "Điều khiển di chuyển" [ref=e53]:
          - button "Đi về phía trước" [ref=e54] [cursor=pointer]: ↑
          - generic [ref=e55]:
            - button "Đi sang trái" [ref=e56] [cursor=pointer]: ←
            - button "Đi lùi" [ref=e57] [cursor=pointer]: ↓
            - button "Đi sang phải" [ref=e58] [cursor=pointer]: →
        - button "? Điều khiển" [ref=e60] [cursor=pointer]:
          - generic [ref=e61]: "?"
          - text: Điều khiển
        - status [ref=e62]: Đã mở Thư viện
      - navigation "Hành động chính trong Guildhall" [ref=e63]:
        - generic [ref=e64]:
          - button "Voice" [ref=e65] [cursor=pointer]:
            - img [ref=e66]
            - generic [ref=e68]: Voice
          - button "Công việc" [ref=e69] [cursor=pointer]:
            - img [ref=e70]
            - generic [ref=e72]: Công việc
          - button "Gold" [ref=e73] [cursor=pointer]:
            - img [ref=e74]
            - generic [ref=e76]: Gold
          - button "Mọi người, 1 online" [ref=e77] [cursor=pointer]:
            - img [ref=e78]
            - generic [ref=e80]: Mọi người
  - alert [ref=e81]
```