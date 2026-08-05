import Skeleton from "@/components/Skeleton";

// タブ（/my 配下）を切り替えたときにも骨組みを出すため、この階層にも置く
export default function Loading() {
  return <Skeleton rows={5} />;
}
