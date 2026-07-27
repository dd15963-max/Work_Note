import { FullstackRoot } from "../react-work-note/src/fullstack/FullstackRoot";
import { requireSiteUser } from "./site-user";

export const dynamic = "force-dynamic";

async function SignedInWorkNote() {
  const user = await requireSiteUser("/");
  return (
    <FullstackRoot
      user={{
        id: user.email,
        email: user.email,
        displayName: user.displayName,
      }}
    />
  );
}

export default function Home() {
  return <SignedInWorkNote />;
}
