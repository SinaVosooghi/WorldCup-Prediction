import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { Team } from '../../prediction/entities/team.entity';
import { teamsData } from './teams.seed';

config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'worldcup_predictions',
  entities: [Team],
  synchronize: false,
});

async function seed() {
  try {
    console.log('🌱 Starting database seed...');

    await AppDataSource.initialize();
    console.log('✅ Database connected');

    const teamRepository = AppDataSource.getRepository(Team);

    // Clear existing teams
    await teamRepository.clear();
    console.log('🗑️  Cleared existing teams');

    // Insert new teams
    const teams = teamsData.map((data) => teamRepository.create(data));
    await teamRepository.save(teams);

    console.log(`✅ Successfully seeded ${teams.length} teams across 12 groups`);
    console.log('📊 Groups: A, B, C, D, E, F, G, H, I, J, K, L (4 teams each)');

    await AppDataSource.destroy();
    console.log('✅ Seed completed successfully');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seed();
