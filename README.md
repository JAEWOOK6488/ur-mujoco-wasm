# UR5e · MuJoCo WASM Robot Lab

**설치 없이 브라우저에서 조작하는 UR5e 로봇 물리 시뮬레이터.**

### [▶ 데모 실행하기](https://jaewook6488.github.io/ur-mujoco-wasm/)

[![UR5e 시뮬레이터 미리보기 — 클릭하면 실제 데모 실행](docs/preview.gif)](https://jaewook6488.github.io/ur-mujoco-wasm/)

README의 위 이미지는 **실제 데모에서 캡처한 애니메이션**입니다. 클릭하면 GitHub Pages에서 **MuJoCo WebAssembly 엔진**을 실행합니다. 현재 버전은 GitHub README 내부에서 WASM을 직접 실행하는 구현이 아닙니다.

## 할 수 있는 것

- **6축 관절 제어**: 목표 각도를 움직이면 위치 제어 모터가 따라갑니다. 목표와 실제 각도를 함께 표시합니다.
- **자세 프리셋**: 기본 자세, 뻗기, 접기.
- **자동 동작 / 일시정지 / 초기화**: 물리 시뮬레이션을 관찰하고 정지할 수 있습니다.
- **끝점 좌표와 궤적**: 툴 장착점의 XYZ 위치(m), 경로, 좌표축을 표시합니다.
- **시점 조작**: 드래그로 회전, 휠로 확대, 우클릭으로 이동합니다.
- **MuJoCo WASM 뷰어 스타일**: 청회색 배경, 반사되는 체크무늬 바닥, 원본 메시 법선과 재질, 어두운 조작 패널.
- 모바일 화면에 대응하며, 물리 계산은 사용자의 브라우저에서 수행합니다.

## 구현

```text
관절 슬라이더 → 속도가 제한된 모터 목표값
             → MuJoCo WASM · 0.002초 간격 물리 계산
             → 관절 / 바디 / 툴 위치
             → Three.js 렌더링 + 실시간 수치 표시
```

| 구성 | 사용한 구현 |
| --- | --- |
| 물리 엔진 | Google DeepMind 공식 `@mujoco/mujoco` 3.15.0, 단일 스레드 WASM |
| 로봇 모델 | MuJoCo Menagerie UR5e · 원본 메시, 관성, 모터, 충돌 형상 |
| 렌더링 | Three.js, WebGL |
| 배포 | GitHub Actions → GitHub Pages |

중력과 접촉이 포함된 물리 모델입니다. 툴 위치는 모델의 `attachment_site` 기준이며, 실물 로봇의 보정된 TCP와는 다를 수 있습니다. 관절 한계 안에서도 바닥 접촉이나 특이 자세가 생길 수 있으며, 충돌 회피 경로 계획·IK·그리퍼 제어는 포함하지 않습니다.

원본 영상은 [Kevin Wood의 UR Robot ROS 2 / RViz 설치 안내](https://www.youtube.com/watch?v=lLF6I9Iduo8)입니다. 이 저장소는 UR 로봇의 동작을 설치 없이 살펴보기 위한 별도 웹 데모이며, ROS 2 또는 RViz 자체를 WASM으로 포팅한 것은 아닙니다. 실물 로봇에 명령을 보내지 않습니다.

## 로컬 실행

Node.js 22+, npm, Python 3가 필요합니다.

```bash
git clone https://github.com/JAEWOOK6488/ur-mujoco-wasm.git
cd ur-mujoco-wasm
npm ci
npm test
npm run build
npm run serve
```

브라우저에서 <http://127.0.0.1:8124>를 엽니다. `file://`로 직접 열지 말고 HTTP 서버를 사용하세요. 첫 로딩에는 모델 메시 약 30 MB와 엔진 약 10 MB(압축 전)를 가져옵니다.

## 검증

`npm test`는 실제 WASM 엔진으로 다음을 확인합니다.

- 6축 모델과 모터 로딩, 중력 아래 기본 자세 유지
- 명령한 자세 추종과 툴 끝점 이동
- 목표값 제한과 초기화
- 20초 자동 궤적에서 수치 발산 여부

브라우저 검증은 서버 실행 후 `node scripts/browser-check.mjs`로 수행합니다. Chrome 경로는 `CHROME_PATH` 환경변수로 지정할 수 있습니다. 관절 조작, 일시정지, 프리셋, 자동 동작, 초기화, 모바일 가로 넘침, JavaScript 오류를 확인합니다.

## 파일 안내

| 파일 | 역할 |
| --- | --- |
| `src/simulation.js` | WASM 로딩, 모델 마운트, 관절 목표, 물리 스텝 |
| `src/scene.js` | MuJoCo 형상 → Three.js 메시, 좌표계 변환 |
| `src/main.js` | UI, 카메라, 시뮬레이션 루프, 궤적 |
| `public/model/` | 출처와 라이선스를 포함한 고정 버전 UR5e 모델 |
| `scripts/vendor-model.py` | 고정된 upstream revision에서 모델 다시 가져오기 |
| `.github/workflows/pages.yml` | 물리 검증, 빌드, 자동 배포 |

## 라이선스와 출처

앱 코드는 MIT, UR5e 모델은 BSD-3-Clause, MuJoCo는 Apache-2.0입니다. [NOTICE](NOTICE)와 [모델 원본 라이선스](public/model/LICENSE)를 확인하세요. 모델 출처는 [MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie/tree/0059d4335f8156206f63a35662313385f7ad6d74/universal_robots_ur5e)입니다.
