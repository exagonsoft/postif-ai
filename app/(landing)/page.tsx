export const revalidate = 3600;

import AdvantagesSection from "../components/landingHeroSectionComponent/advantagesSection";
import FaqsSection from "../components/landingHeroSectionComponent/faqsSection";
import FeaturesSection from "../components/landingHeroSectionComponent/featuresSection";
import HeroSection from "../components/landingHeroSectionComponent/hero";
import LandingFooter from "../components/landingHeroSectionComponent/landingFooter";
import PricingSection from "../components/landingHeroSectionComponent/pricingSection";
import TrustedSection from "../components/landingHeroSectionComponent/trustedSection";
import UseCasesSection from "../components/landingHeroSectionComponent/useCasesSection";

export default function Home() {
  return (
    <>
      <HeroSection />
      <AdvantagesSection />
      <FeaturesSection />
      <UseCasesSection />
      <PricingSection />
      <FaqsSection />
      <TrustedSection />
      <LandingFooter />
    </>
  );
}
