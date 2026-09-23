import { createFileRoute } from '@tanstack/react-router';
import { HomeScreen } from '@/app/HomeScreen';

export const Route = createFileRoute('/')({ component: HomeScreen });
