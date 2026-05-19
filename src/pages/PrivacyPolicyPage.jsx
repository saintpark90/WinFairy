import { Link } from 'react-router-dom'
import AppTail from '../components/AppTail'

const EFFECTIVE_DATE = '2026년 5월 19일'

function PrivacyPolicyPage() {
  return (
    <div className="app-shell privacy-shell">
      <header className="privacy-header">
        <Link to="/" className="privacy-back-link">
          ← 돌아가기
        </Link>
        <h1 className="privacy-title">개인정보 처리방침</h1>
      </header>

      <main className="card privacy-policy-card">
        <p className="privacy-effective muted">시행일: {EFFECTIVE_DATE}</p>

        <p>
          승리요정(WinFairy, 이하 &quot;서비스&quot;)는 「개인정보 보호법」 등 관련 법령과
          개인정보보호위원회의 개인정보 처리방침 작성 지침을 준수하여, 이용자의 개인정보를
          보호하고 이와 관련한 고충을 신속·원활하게 처리하기 위해 다음과 같이 개인정보
          처리방침을 수립·공개합니다.
        </p>

        <section>
          <h2>1. 개인정보의 처리 목적</h2>
          <p>서비스는 다음 목적을 위해 개인정보를 처리합니다. 처리 목적이 변경되는 경우
            「개인정보 보호법」 제18조에 따라 별도 동의를 받습니다.</p>
          <ul>
            <li>
              <strong>회원 가입 및 관리</strong>: 카카오 로그인을 통한 본인 식별·인증, 회원
              자격 유지·관리, 부정 이용 방지, 고지·통지
            </li>
            <li>
              <strong>서비스 제공</strong>: 직관 일정 입력·조회, 팀·선수 통계 및 순위 제공,
              맞춤형 콘텐츠(유니폼 추천 등) 제공
            </li>
            <li>
              <strong>서비스 개선</strong>: 접속 빈도 파악, 서비스 이용 통계, 서비스 안정성
              확보
            </li>
          </ul>
        </section>

        <section>
          <h2>2. 처리하는 개인정보 항목</h2>
          <h3>① 이용자가 제공하는 정보</h3>
          <ul>
            <li>
              <strong>카카오 로그인(OAuth)</strong>: 카카오 계정 식별값, 닉네임(또는 이름),
              프로필 사진 URL, 이메일(카카오 동의 항목에 포함된 경우)
            </li>
            <li>
              <strong>서비스 이용 정보</strong>: 직관(관람) 일자, 입력한 경기 연동 정보
            </li>
          </ul>
          <h3>② 자동으로 수집되는 정보</h3>
          <ul>
            <li>
              서비스 이용 과정에서 IP 주소, 쿠키, 접속 로그, 기기 정보, 브라우저 정보 등이
              생성되어 수집될 수 있습니다.
            </li>
            <li>
              Vercel Analytics 등 웹 분석 도구를 통해 익명화된 이용 통계가 수집될 수
              있습니다.
            </li>
          </ul>
          <p>
            참여코드는 서비스 접근 통제 목적으로 입력받으나, 별도의 개인정보로 저장하지
            않습니다.
          </p>
        </section>

        <section>
          <h2>3. 개인정보의 처리 및 보유 기간</h2>
          <p>
            서비스는 법령에 따른 개인정보 보유·이용 기간 또는 이용자로부터 동의받은 기간
            내에서 개인정보를 처리·보유합니다.
          </p>
          <ul>
            <li>
              <strong>회원 정보</strong>: 회원 탈퇴(계정 삭제) 시까지. 탈퇴 후 지체 없이
              파기합니다. 단, 관련 법령에 따라 보존할 필요가 있는 경우 해당 기간 동안
              보관합니다.
            </li>
            <li>
              <strong>직관 기록</strong>: 회원 탈퇴와 함께 파기합니다.
            </li>
          </ul>
          <p>관련 법령에 따른 보관 사유가 있는 경우 해당 기간 동안 보관할 수 있습니다.</p>
        </section>

        <section>
          <h2>4. 개인정보의 제3자 제공</h2>
          <p>
            서비스는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만,
            이용자의 사전 동의가 있거나 법령의 규정에 의거한 경우에 한하여 제공할 수
            있습니다.
          </p>
        </section>

        <section>
          <h2>5. 개인정보 처리의 위탁</h2>
          <p>서비스는 원활한 운영을 위해 다음과 같이 개인정보 처리 업무를 위탁합니다.</p>
          <div className="table-wrap">
            <table className="privacy-table">
              <thead>
                <tr>
                  <th scope="col">수탁자</th>
                  <th scope="col">위탁 업무</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Supabase Inc.</td>
                  <td>회원 인증, 데이터베이스 호스팅 및 저장</td>
                </tr>
                <tr>
                  <td>Kakao Corp.</td>
                  <td>소셜 로그인(본인 확인·인증)</td>
                </tr>
                <tr>
                  <td>Vercel Inc.</td>
                  <td>웹 서비스 호스팅, 접속 통계(Analytics)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            위탁계약 체결 시 「개인정보 보호법」 제26조에 따라 위탁 업무 수행 목적 외
            처리 금지, 기술적·관리적 보호조치, 재위탁 제한, 수탁자 관리·감독, 손해배상
            등 책임에 관한 사항을 문서로 명시하고, 수탁자가 개인정보를 안전하게
            처리하는지 감독합니다.
          </p>
        </section>

        <section>
          <h2>6. 정보주체의 권리·의무 및 행사 방법</h2>
          <p>이용자(정보주체)는 다음 권리를 행사할 수 있습니다.</p>
          <ul>
            <li>개인정보 열람 요구</li>
            <li>오류 등이 있을 경우 정정·삭제 요구</li>
            <li>처리 정지 요구</li>
          </ul>
          <p>
            권리 행사는 서비스 내 「내 정보」 메뉴에서 계정 삭제를 통해 직접 수행하거나,
            개인정보 보호책임자에게 서면·전자우편 등으로 요청하실 수 있습니다. 서비스는
            지체 없이 조치하겠습니다.
          </p>
          <p>
            만 14세 미만 아동의 경우, 법정대리인의 동의를 통해 서비스를 이용할 수
            있습니다.
          </p>
        </section>

        <section>
          <h2>7. 개인정보의 파기</h2>
          <p>
            서비스는 개인정보 보유 기간 경과, 처리 목적 달성 등 개인정보가 불필요하게
            되었을 때 지체 없이 해당 개인정보를 파기합니다.
          </p>
          <ul>
            <li>
              <strong>파기 절차</strong>: 이용자가 입력한 정보는 목적 달성 후 별도 DB로
              옮겨져(또는 즉시) 내부 방침 및 법령에 따라 일정 기간 저장 후 파기됩니다.
            </li>
            <li>
              <strong>파기 방법</strong>: 전자적 파일은 복구·재생 불가능한 방법으로
              영구 삭제하고, 종이 문서는 분쇄 또는 소각합니다.
            </li>
          </ul>
          <p>
            「내 정보」 → 「계정 삭제」를 통해 회원 탈퇴 시 연동된 직관 기록·프로필 정보가
            함께 삭제됩니다.
          </p>
        </section>

        <section>
          <h2>8. 개인정보의 안전성 확보 조치</h2>
          <p>서비스는 개인정보 보호를 위해 다음 조치를 취하고 있습니다.</p>
          <ul>
            <li>개인정보 접근 권한 관리 및 최소화</li>
            <li>개인정보 암호화(전송 구간 HTTPS, DB 접근 통제)</li>
            <li>접속 기록 보관 및 위변조 방지</li>
            <li>해킹·악성코드 대비 보안 조치</li>
            <li>개인정보 취급자 최소화 및 교육</li>
          </ul>
        </section>

        <section>
          <h2>9. 쿠키의 설치·운영 및 거부</h2>
          <p>
            서비스는 로그인 세션 유지 등을 위해 쿠키 및 localStorage를 사용할 수
            있습니다. 이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 이
            경우 로그인 등 일부 서비스 이용에 제한이 있을 수 있습니다.
          </p>
        </section>

        <section>
          <h2>10. 개인정보 보호책임자</h2>
          <p>
            서비스는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 이용자의 불만 처리
            및 피해 구제를 위해 아래와 같이 개인정보 보호책임자를 지정합니다.
          </p>
          <ul>
            <li>성명: 승리요정 서비스 운영자</li>
            <li>연락처: 서비스 「내 정보」 페이지 또는 GitHub 저장소 이슈를 통해 문의</li>
          </ul>
          <p>
            기타 개인정보 침해 신고·상담은 아래 기관에 문의하실 수 있습니다.
          </p>
          <ul>
            <li>개인정보침해신고센터 (privacy.kisa.or.kr / 국번 없이 118)</li>
            <li>개인정보분쟁조정위원회 (www.kopico.go.kr / 1833-6972)</li>
            <li>대검찰청 사이버수사과 (www.spo.go.kr / 1301)</li>
            <li>경찰청 사이버수사국 (ecrm.police.go.kr / 182)</li>
          </ul>
        </section>

        <section>
          <h2>11. 개인정보 처리방침의 변경</h2>
          <p>
            본 방침은 법령·서비스 변경에 따라 수정될 수 있으며, 변경 시 시행일 7일
            전(이용자 권리에 중대한 변경 시 30일 전)부터 서비스 내 공지합니다.
          </p>
        </section>
      </main>

      <AppTail />
    </div>
  )
}

export default PrivacyPolicyPage
