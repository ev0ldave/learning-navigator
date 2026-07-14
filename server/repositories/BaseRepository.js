/**
 * Base Repository - Abstracts database operations for Dependency Inversion Principle
 * High-level modules depend on this abstraction, not concrete Mongoose models
 */
class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  async findById(id, options = {}) {
    let query = this.model.findById(id);
    if (options.populate) {
      options.populate.forEach(p => {
        query = query.populate(p);
      });
    }
    if (options.select) {
      query = query.select(options.select);
    }
    return query.exec();
  }

  async findOne(filter, options = {}) {
    let query = this.model.findOne(filter);
    if (options.populate) {
      options.populate.forEach(p => {
        query = query.populate(p);
      });
    }
    if (options.select) {
      query = query.select(options.select);
    }
    return query.exec();
  }

  async find(filter, options = {}) {
    let query = this.model.find(filter);
    if (options.sort) {
      query = query.sort(options.sort);
    }
    if (options.skip) {
      query = query.skip(options.skip);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.populate) {
      options.populate.forEach(p => {
        query = query.populate(p);
      });
    }
    if (options.select) {
      query = query.select(options.select);
    }
    return query.exec();
  }

  async count(filter) {
    return this.model.countDocuments(filter);
  }

  async create(data) {
    const entity = new this.model(data);
    return entity.save();
  }

  async updateById(id, data) {
    return this.model.findByIdAndUpdate(id, data, { new: true });
  }

  async updateOne(filter, data) {
    return this.model.findOneAndUpdate(filter, data, { new: true });
  }

  async updateMany(filter, data) {
    return this.model.updateMany(filter, data);
  }

  async deleteById(id) {
    return this.model.findByIdAndDelete(id);
  }

  async deleteMany(filter) {
    return this.model.deleteMany(filter);
  }

  /**
   * Execute a custom query - for complex queries not covered by base methods
   */
  getModel() {
    return this.model;
  }
}

module.exports = BaseRepository;
