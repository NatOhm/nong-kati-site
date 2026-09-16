import { HamsterLoader } from '@/components/loading/HamsterLoader';

/** Route-segment wait state: clay hamster bounce while server data loads. */
export default function Loading(): React.JSX.Element {
  return <HamsterLoader />;
}
