export async function getBusinessForUser(
  api: any,
  userId: string
): Promise<{
  id: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  onboardingComplete: boolean | null;
} | null> {
  const business = await api.business.findFirst({
    filter: {
      owner: {
        id: {
          equals: userId,
        },
      },
    },
    select: {
      id: true,
      name: true,
      type: true,
      phone: true,
      email: true,
      onboardingComplete: true,
    },
  });

  return business ?? null;
}