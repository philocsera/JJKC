import { PrismaClient } from '../prototype/node_modules/@prisma/client'; 
import { searchVideosByKeyword } from '../prototype/lib/youtube'; 

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 테스트 시작...");

  // 1. 내 프로필 확인 (music 키워드)
  const profile = await prisma.algoProfile.findFirst();
  const myKeyword = Array.isArray(profile?.keywords) ? profile.keywords[0] : "music";

  // 2. [핵심] 가장 최근에 로그인(업데이트)된 토큰 가져오기
  const account = await prisma.account.findFirst({
    where: { provider: 'google' },
    orderBy: { 
      // id가 아닌 업데이트 시간이나 만료 시간으로 정렬하여 
      // 방금 새로 로그인한 세션을 잡습니다.
      expires_at: 'desc' 
    }
  });

  if (account?.access_token) {
    console.log(`🔎 키워드 [${myKeyword}]로 검색 시도...`);
    console.log(`🔑 사용 중인 토큰 확인: ${account.access_token.substring(0, 15)}...`);
    
    try {
      // 3. 유튜브 API 호출
      const videos = await searchVideosByKeyword(account.access_token, myKeyword);
      
      console.log("\n=== 🎬 유튜브 검색 성공! ===");
      videos.forEach((video: any, index: number) => {
        console.log(`${index + 1}. ${video.snippet.title}`);
      });
    } catch (error: any) {
      console.error("❌ API 호출 중 오류 발생:", error.message);
      if (error.response?.status === 401) {
        console.log("💡 팁: Prisma Studio에서 방금 생성된 토큰이 맞는지 확인해 보세요.");
      }
    }
  } else {
    console.error("❌ DB에서 access_token을 찾을 수 없습니다.");
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());