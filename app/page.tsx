import { AroundMyDormApp } from "@/components/AroundMyDormApp";
import { NewPlacesSpotlight } from "@/components/NewPlacesSpotlight";

export default function HomePage() {
  return (
    <>
      <NewPlacesSpotlight />
      <AroundMyDormApp initialTab="explore" />
    </>
  );
}
